import { createUnplugin } from "unplugin";
import { build as eznoBuild, just_imports } from "ezno/initialised";
import { readFileSync } from "node:fs";

/// <reference path="types.d.ts"/>

function emitDiagnostics(on, diagnostics, plugin) {
	const lineSplits = [0];
	for (const line of on.split("\n")) {
		// TODO need buffer length not character count
		lineSplits.push(lineSplits.at(-1) + line.length + 1)
	}
	for (const diagnostic of diagnostics) {
		const line = lineSplits.findIndex(count => count >= diagnostic.position.start);
		const column = diagnostic.position.start - lineSplits[line - 1] + 1;
		// Unfortunately don't get to set an end point, level or any labels
		plugin.warn(diagnostic.label, { line, column })
	}
}

/** @param {import("./types").EznoUnpluginOptions} options  */
function plugin(options) {
	let allJSFiles = options.allJSFiles ?? false;
	// TODO the other 50
	const extensions = ["ts", "tsx", "js", "jsx"];

	const build = options.customBuild ?? eznoBuild;

	const name = "ezno";
	const esbuild = {
		name,
		setup(build) {
			build.onLoad({ filter: /\.ts(x?)$/ }, async ({ path }) => {
				const code = readFileSync(path, 'utf8');
				try {
					const imports = just_imports(code);
					if (typeof imports === "string") {
						return { contents: imports };
					} else {
						throw Error("Issue parsing");
					}
				} catch (e) {
					return { errors: [] };
				}
			});
		},
	};
	return {
		name,
		vite: {
			enforce: 'pre',
			configResolved(config) {
				config.optimizeDeps.esbuildOptions.plugins = [esbuild];
			},
		},
		transformInclude(id) {
			const extension = id.split(".");
			const jsTsLikeExtension = extensions.includes(extension.at(-1));
			if (allJSFiles) {
				return jsTsLikeExtension;
			} else {
				return jsTsLikeExtension && extension.at(-2) == "ezno";
			}
		},
		transform(code, path) {
			/** Passed to Ezno's builder so it can import more */
			function readFile(pathEznoWantsToRead) {
				if (pathEznoWantsToRead !== path) {
					console.error(`tried to import '${pathEznoWantsToRead}' which is currently unsupported by the plugin`)
					return null;
				} else {
					return code;
				}
			}

			const output = build(readFile, path, false);
			if (output.Ok) {
				emitDiagnostics(code, output.Ok.diagnostics, this)
				return {
					code: output.Ok.outputs[0].content
				}
			} else {
				emitDiagnostics(code, output.Err, this)
				this.warn("ezno had errors and did not transform");
				return code;
			}
		},
	};
}

export default createUnplugin(plugin);
