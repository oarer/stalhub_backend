export function isMapAssetPath(path: string) {
	const resource = path.replace(/^\/api\/v1\/map3d\//, '')
	if (resource === path) return false
	return (
		/^(materials|shapes|texture-version|texture|sr-texture(?:-hd)?|model(?:-raw|-texture|-material)?|maps)$/.test(
			resource
		) ||
		/^maps\/[^/]+\/tile\/-?\d+\/-?\d+$/.test(resource) ||
		/^effect-resource\/.+/.test(resource) ||
		/^instances\/[^/]+\/(?:chunk|objects|objects-raw)\/-?\d+\/-?\d+$/.test(
			resource
		) ||
		/^instances\/[^/]+\/terrain-lod\/(?:manifest|(?:chunks|regions)\/-?\d+\/-?\d+)$/.test(
			resource
		) ||
		/^instances\/[^/]+\/(?:chunks|render-configs|effect-bindings|sr-materials)$/.test(
			resource
		)
	)
}

/** Prevent a Prometheus series for every captured coordinate or effect filename. */
export function mapMetricRoute(path: string) {
	if (!path.startsWith('/map3d/')) return undefined
	return path
		.replace(/^\/map3d\/instances\/[^/]+/, '/map3d/instances/:instance')
		.replace(/\/(chunk|objects|objects-raw)\/-?\d+\/-?\d+$/, '/$1/:x/:z')
		.replace(
			/\/terrain-lod\/(chunks|regions)\/-?\d+\/-?\d+$/,
			'/terrain-lod/$1/:x/:z'
		)
		.replace(
			/^\/map3d\/maps\/[^/]+\/tile\/-?\d+\/-?\d+$/,
			'/map3d/maps/:map/tile/:x/:z'
		)
		.replace(
			/^\/map3d\/effect-resource\/.+$/,
			'/map3d/effect-resource/:resource'
		)
		.replace(/^\/map3d\/notes\/[^/]+$/, '/map3d/notes/:id')
}
