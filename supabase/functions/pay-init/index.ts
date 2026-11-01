import { handleInit } from '../_shared/handlers.ts'
import { serve, setup } from '../_shared/serve.ts'

const { env, deps } = setup()
serve((req) => handleInit(req, env, deps))
