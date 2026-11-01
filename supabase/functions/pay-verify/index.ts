import { handleVerify } from '../_shared/handlers.ts'
import { serve, setup } from '../_shared/serve.ts'

const { env, deps } = setup()
serve((req) => handleVerify(req, env, deps))
