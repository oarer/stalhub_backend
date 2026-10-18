import { setupTypebox } from 'elysia'
import * as typeboxSystem from 'typebox/system'
import * as typeboxType from 'typebox/type'

setupTypebox({ typebox: { type: typeboxType, system: typeboxSystem } })
