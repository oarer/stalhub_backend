import { describe, expect, test } from 'bun:test'
import { normalizeCustomization } from '@/app/api/uno/profile'
import type { UnoRawPlayer } from '@/types/uno.type'

const sticker = (
	src: string,
	parameters: number[] | null = null,
	slot: number | null = null
) => ({
	src,
	top: parameters ? 50 + parameters[1] / 2 : null,
	left: parameters ? 50 + parameters[0] / 2 : null,
	width: parameters
		? parameters[5] > 0
			? parameters[2] < 0
				? -parameters[5]
				: parameters[5]
			: parameters[2]
		: null,
	rotate: parameters ? parameters[4] : null,
	image_width: null,
	image_height: null,
	slot,
	flipbook: null,
})

describe('UNO profile customization', () => {
	test('reads customization assets from the nested profile appearance payload', () => {
		const player: UnoRawPlayer = {
			profile: {
				appearance: {
					background_url: 'backgrounds/profile.png',
					frameUrl: 'frames/steel.png',
					sticker_urls: [
						{ url: 'stickers/one.png' },
						'stickers/two.png',
					],
				},
			},
		}

		expect(normalizeCustomization(player)).toEqual({
			background: 'https://static.stalhub.dev/sc/backgrounds/profile.png',
			pattern: null,
			frame: 'https://static.stalhub.dev/sc/frames/steel.png',
			stickers: [
				sticker('https://static.stalhub.dev/sc/stickers/one.png'),
				sticker('https://static.stalhub.dev/sc/stickers/two.png'),
			],
		})
	})

	test('keeps canonical top-level fields and filters invalid assets', () => {
		const player: UnoRawPlayer = {
			background: 'backgrounds/profile.png',
			frame: 'https://assets.example/frame.png',
			stickers: ['stickers/one.png', '../private.png'],
		}

		expect(normalizeCustomization(player)).toEqual({
			background: 'https://static.stalhub.dev/sc/backgrounds/profile.png',
			pattern: null,
			frame: 'https://assets.example/frame.png',
			stickers: [
				sticker('https://static.stalhub.dev/sc/stickers/one.png'),
			],
		})
	})

	test('converts DDS assets to PNG URLs and maps sticker parameters', () => {
		const player: UnoRawPlayer = {
			customization: {
				available: true,
				variant: 1,
				background: {
					item_id: 4205,
					parameters: [-39, 100, 100, 0],
					flag: false,
					definition: {
						item_id: 4205,
						type: 'player_card/background',
						image: 'stalker:textures/gui/customisation/backgrounds/faction/covenant.dds',
					},
					name: 'Фон «Завета»',
					image: 'stalker:textures/gui/customisation/backgrounds/faction/covenant.dds',
					type: 'player_card/background',
				},
				pattern: {
					item_id: 4524,
					parameters: [65, 26, 100, 0, 17],
					flag: true,
					definition: {
						item_id: 4524,
						type: 'player_card/pattern',
						image: 'stalker:textures/gui/customisation/patterns/event/coldline.dds',
					},
					image: 'stalker:textures/gui/customisation/patterns/event/coldline.dds',
					type: 'player_card/pattern',
				},
				stickers: [
					{
						item_id: 4915,
						parameters: [87, 10, 40, 0, -12, 47],
						slot: 1,
						definition: {
							item_id: 4915,
							type: 'player_card/sticker',
						},
						image: 'stalker:textures/gui/customisation/stickers/media/twitch.dds',
						type: 'player_card/sticker',
					},
					{
						item_id: 4987,
						parameters: [-89, 11, 84, 0, -72, 0],
						slot: 3,
						definition: {
							item_id: 4987,
							type: 'player_card/sticker',
							image: 'stalker:textures/gui/customisation/stickers/nea/leaves.dds',
						},
						type: 'player_card/sticker',
					},
					{
						item_id: 4956,
						parameters: [-25, 4, 66, 0, 5, 0],
						slot: 2,
						definition: {
							item_id: 4956,
							type: 'player_card/sticker',
						},
						type: 'player_card/sticker',
					},
				],
			},
		}

		expect(normalizeCustomization(player)).toEqual({
			background:
				'https://static.stalhub.dev/sc/stalker/textures/gui/customisation/backgrounds/faction/covenant.png',
			pattern:
				'https://static.stalhub.dev/sc/stalker/textures/gui/customisation/patterns/event/coldline.png',
			frame: null,
			stickers: [
				sticker(
					'https://static.stalhub.dev/sc/stalker/textures/gui/customisation/stickers/media/twitch.png',
					[87, 10, 40, 0, -12, 47],
					1
				),
				sticker(
					'https://static.stalhub.dev/sc/stalker/textures/gui/customisation/stickers/nea/leaves.png',
					[-89, 11, 84, 0, -72, 0],
					3
				),
			],
		})
	})
})
