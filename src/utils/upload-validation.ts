import { detectImageMime, IMAGE_MIME_EXTENSIONS } from './image-compress'

const BYTES_PER_MB = 1024 * 1024

export const IMAGE_UPLOAD_MAX_BYTES = 10 * BYTES_PER_MB

/**
 * Валидация загружаемого изображения: магические байты важнее имени файла
 * и объявленного Content-Type, расширение результата берётся из самой
 * сигнатуры. Загрузка HTML/JS/SVG-others невозможна — only raster images.
 */
export function validateImageUpload(buffer: Buffer): {
	mime: keyof typeof IMAGE_MIME_EXTENSIONS
	ext: string
} {
	if (!buffer.length || buffer.length > IMAGE_UPLOAD_MAX_BYTES)
		throw new Error(
			`Image must be between 1 byte and ${IMAGE_UPLOAD_MAX_BYTES / BYTES_PER_MB} MB`
		)
	const mime = detectImageMime(buffer)
	if (!mime) throw new Error('Only jpg/png/webp/gif images are allowed')
	return { mime, ext: `.${IMAGE_MIME_EXTENSIONS[mime]}` }
}
