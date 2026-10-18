import { setupTypebox } from 'elysia'
import * as typeboxCompile from 'typebox/compile'
import * as typeboxSchema from 'typebox/schema'
import * as typeboxSystem from 'typebox/system'
import * as typeboxType from 'typebox/type'
import * as typeboxValue from 'typebox/value'

setupTypebox({
	typebox: {
		type: typeboxType,
		system: typeboxSystem,
		value: typeboxValue,
		schema: typeboxSchema,
		compile: typeboxCompile,
	},
})
