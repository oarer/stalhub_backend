import type { Message } from './api.type'

export type AttachmentFormatted = {
	value?: Record<string, string>
	nameColor?: string
	valueColor?: string
}

export type AttachmentElement = {
	type: string
	name?: Message
	key?: Message
	value?: number | number[]
	text?: Message
	min?: number
	max?: number
	formatted?: AttachmentFormatted
}

export type AttachmentInfoBlock = {
	type: string
	title: Message
	elements: AttachmentElement[]
}

export type AttachmentItem = {
	id: string
	category: string
	name: Message
	color: string
	status?: { state: string }
	infoBlocks: AttachmentInfoBlock[]
}

export type WeaponEntry = {
	id: string
	category: string
	name: Message
	color: string
}

export type AttachmentsResponse = {
	weapon: WeaponEntry
	attachments: AttachmentItem[]
}
