import type { TargetConfiguration } from 'nx/src/devkit-exports';
import { nxWorkspace } from '@nx-console/shared-nx-workspace-info';
import { normalize, relative } from 'path';
import { lspLogger } from '@nx-console/language-server-utils';

let _sourceMapFilesToProjectMap: Record<string, string[]> | undefined =
  undefined;

/**
 * iterate over sourcemaps and return all files that were involved in creating a project along with the project name
 */
export async function getSourceMapFilesToProjectsMap(
  workingPath: string,
): Promise<Record<string, string[]>> {
  if (_sourceMapFilesToProjectMap) {
    return _sourceMapFilesToProjectMap;
  }
  const { sourceMaps } = await nxWorkspace(workingPath, lspLogger);
  const sourceMapFilesToProjectMap: Record<string, string[]> = {};

  Object.entries(sourceMaps ?? {}).forEach(([projectRoot, sourceMap]) => {
    Object.values(sourceMap).forEach(([file]) => {
      if (!file || file === 'nx.json') {
        return;
      }
      if (!sourceMapFilesToProjectMap[file]) {
        sourceMapFilesToProjectMap[file] = [];
      }
      if (!sourceMapFilesToProjectMap[file].includes(projectRoot)) {
        sourceMapFilesToProjectMap[file].push(projectRoot);
      }
    });
  });

  _sourceMapFilesToProjectMap = sourceMapFilesToProjectMap;
  return sourceMapFilesToProjectMap;
}

export async function getTargetsForConfigFile(
  projectName: string,
  configFilePath: string,
  workingPath: string,
): Promise<Record<string, TargetConfiguration> | undefined> {
  const { sourceMaps, projectGraph } = await nxWorkspace(
    workingPath,
    lspLogger,
  );

  configFilePath = normalize(configFilePath);

  if (configFilePath.includes(workingPath)) {
    configFilePath = relative(workingPath, configFilePath);
  }

  const project = projectGraph.nodes[projectName];

  if (!project || !sourceMaps) {
    return;
  }

  const sourceMap = sourceMaps[project.data.root];

  const targets: Record<string, TargetConfiguration> = {};
  Object.entries(sourceMap)
    .filter<[string, [string, string]]>(isKeyWithTargetsAndFileNotNull)
    .forEach(([key, [file]]: [string, [string, string]]) => {
      if (normalize(file) === configFilePath) {
        const targetName = key.split('.')[1];
        const target = project.data.targets?.[targetName];
        if (target) {
          targets[targetName] = target;
        }
      }
    });

  return targets;
}

export function resetSourceMapFilesToProjectCache() {
  _sourceMapFilesToProjectMap = undefined;
}

export function isKeyWithTargetsAndFileNotNull(
  value: [string, [string | null, string]],
): value is [string, [string, string]] {
  return value[0].startsWith('targets.') && value[1][0] !== null;
}
