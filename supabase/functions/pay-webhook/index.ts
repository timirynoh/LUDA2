import { handleWebhook } from '../_shared/handlers.ts'
import { serve, setup } from '../_shared/serve.ts'

const { env, deps } = setup()
serve((req) => handleWebhook(req, env, deps))
