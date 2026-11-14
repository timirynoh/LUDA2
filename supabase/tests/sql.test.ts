// Direct checks of the SQL money functions (run before the API tests). Plain JS is valid TS.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
const db = new PGlite()
await db.exec(`create schema auth; create table auth.users (id uuid primary key, email text); create role anon; create role authenticated; create role service_role;`)
const dir = new URL('../migrations/', import.meta.url)
for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'))
const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users values ('${A}','a@x.com'),('${B}','b@x.com');
insert into profiles (user_id, username, full_name, email) values ('${A}','ada','Ada Okafor','a@x.com'),('${B}','bola','Bola Ade','b@x.com');`)
const q = async (sql: string, p: unknown[] = []): Promise<any[]> => (await db.query(sql, p)).rows
const one = async (sql: string, p?: unknown[]): Promise<any> => Object.values((await q(sql, p))[0] as object)[0]
const bal = async (u: string, c: string) => Number((await q('select balance_minor from wallets where user_id=$1 and currency=$2', [u, c]))[0]?.balance_minor ?? 0)
const fails = async (sql: string, p: unknown[], re: RegExp) => { try { await q(sql, p); assert.fail('should fail') } catch (e) { assert.match(e.message, re) } }

// deposit: pending -> paid credits once
await q(`insert into payments (reference, provider, purpose, amount_minor, currency, base_amount, base_currency, fx_rate, email, item, user_id, fee_minor, credit_minor)
         values ('dep1','paystack','deposit',1025000,'NGN',10000,'NGN',1,'a@x.com','{}',$1,25000,1000000)`, [A])
await q(`select luda_deposit_paid('dep1','tx9')`); await q(`select luda_deposit_paid('dep1','tx9')`)
assert.equal(await bal(A, 'NGN'), 1000000, 'credited ₦10,000 once')

// overspend refused, nothing changes
await fails(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: A, currency: 'NGN', amount_minor: -2000000, kind: 'send', ref: 'r1' }])], /insufficient_funds/)
assert.equal(await bal(A, 'NGN'), 1000000)

// convert NGN->TRY atomically; replay is a no-op
const conv = [{ user_id: A, currency: 'NGN', amount_minor: -420000, kind: 'convert', ref: 'c1' }, { user_id: A, currency: 'TRY', amount_minor: 10000, kind: 'convert', ref: 'c1' }]
await q(`select luda_post($1::jsonb)`, [JSON.stringify(conv)]); const dup = await one(`select luda_post($1::jsonb)`, [JSON.stringify(conv)])
assert.equal(dup.duplicate, true); assert.equal(await bal(A, 'NGN'), 580000); assert.equal(await bal(A, 'TRY'), 10000)

// send: both sides or nothing
await fails(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: A, currency: 'TRY', amount_minor: -50000, kind: 'send', ref: 's1' }, { user_id: B, currency: 'TRY', amount_minor: 50000, kind: 'receive', ref: 's1' }])], /insufficient/)
assert.equal(await bal(B, 'TRY'), 0, 'receiver not credited when sender lacks funds')
await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: A, currency: 'TRY', amount_minor: -2500, kind: 'send', ref: 's2' }, { user_id: B, currency: 'TRY', amount_minor: 2500, kind: 'receive', ref: 's2' }])])
assert.equal(await bal(A, 'TRY'), 7500); assert.equal(await bal(B, 'TRY'), 2500)

// ticket: debit + ticket row together; not enough money -> no ticket
const t = await one(`select luda_buy_ticket($1,'TRY',5000,50,'ABCD2345','{"label":"VirgoBus"}')`, [A]); assert.equal(t.ticket.code, 'ABCD2345')
await fails(`select luda_buy_ticket($1,'TRY',999999,50,'ZZZZ2345','{}')`, [A], /insufficient/)
assert.equal(await one(`select count(*)::int from tickets`), 1); assert.equal(await bal(A, 'TRY'), 2500)

// withdrawal: amount + fee out; failed -> back once; paid stays
await q(`select luda_withdraw($1,'w1',300000,5000,'058','GTBank','0123456789','ADA OKAFOR','RCP_x')`, [A]); assert.equal(await bal(A, 'NGN'), 275000)
await q(`select luda_withdraw_settle('w1','failed',null,'bank down')`); await q(`select luda_withdraw_settle('w1','failed',null,'again')`)
assert.equal(await bal(A, 'NGN'), 580000, 'refunded once incl. fee')
await q(`select luda_withdraw($1,'w2',100000,5000,'058','GTBank','0123456789','ADA OKAFOR','RCP_x')`, [A]); await q(`select luda_withdraw_settle('w2','paid','TRF_1',null)`)
assert.equal(await bal(A, 'NGN'), 475000)
await q(`select luda_withdraw_settle('w2','reversed',null,'bank reversed')`); assert.equal(await bal(A, 'NGN'), 580000, 'reversal after paid refunds')
await fails(`select luda_withdraw($1,'w3',9000000,0,'058','x','1','x','x')`, [A], /insufficient/)
assert.equal(await one(`select count(*)::int from withdrawals where reference='w3'`), 0, 'no withdrawal row when funds short')

// frozen: cannot spend, can receive
await q(`update profiles set frozen = true where user_id=$1`, [B])
await fails(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: B, currency: 'TRY', amount_minor: -100, kind: 'send', ref: 's3' }])], /account_frozen/)
await q(`select luda_post($1::jsonb)`, [JSON.stringify([{ user_id: B, currency: 'TRY', amount_minor: 100, kind: 'receive', ref: 's4' }])])

// limits helper + ledger always matches balances
assert.equal(Number(await one(`select luda_spent($1,'NGN',array['withdraw'],24)`, [A])), 400000)
const mism = await q(`select w.user_id, w.currency from wallets w left join (select user_id, currency, sum(amount_minor) s from ledger group by 1,2) l using (user_id, currency) where w.balance_minor <> coalesce(l.s,0)`)
assert.equal(mism.length, 0, 'ledger sums equal balances')
// app roles cannot call money functions
assert.equal(await one(`select has_function_privilege('anon','luda_post(jsonb)','execute')`), false)
assert.equal(await one(`select has_function_privilege('authenticated','luda_withdraw_settle(text,text,text,text)','execute')`), false)
test('SQL money functions: atomic, idempotent, never negative, ledger balanced', () => {})
