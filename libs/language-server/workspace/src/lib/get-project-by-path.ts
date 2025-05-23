import { directoryExists } from '@nx-console/shared-file-system';
import type { ProjectConfiguration } from 'nx/src/devkit-exports';
import { isAbsolute, join, normalize, relative, sep } from 'path';
import { nxWorkspace } from '@nx-console/shared-nx-workspace-info';
import { platform } from 'os';
import { lspLogger } from '@nx-console/language-server-utils';
let _rootProjectMap: Record<string, ProjectConfiguration> | undefined;

export function resetProjectPathCache() {
  _rootProjectMap = undefined;
}

export async function getProjectByPath(
  path: string,
  workspacePath: string,
): Promise<ProjectConfiguration | undefined> {
  path = normalize(path);
  // windows paths like /c:/Users/... aren't correctly picked up by normalize() so we need to handle them ourselves
  path =
    path.startsWith(sep) && platform() === 'win32' ? path.substring(1) : path;
  const projectsMap = await getProjectsByPaths([path], workspacePath);
  return projectsMap?.[path] || undefined;
}

export async function getProjectByRoot(
  rootPath: string,
  workspacePath: string,
): Promise<ProjectConfiguration | undefined> {
  if (_rootProjectMap && _rootProjectMap[rootPath]) {
    return _rootProjectMap[rootPath];
  }

  const { projectGraph } = await nxWorkspace(workspacePath, lspLogger);
  const rootProjectMap: Record<string, ProjectConfiguration> = {};
  const projectEntries = Object.entries(projectGraph.nodes);
  for (const [, projectConfig] of projectEntries) {
    rootProjectMap[projectConfig.data.root] = projectConfig.data;
  }
  _rootProjectMap = rootProjectMap;

  return _rootProjectMap?.[rootPath];
}

export async function getProjectsByPaths(
  paths: string[] | undefined,
  workspacePath: string,
): Promise<Record<string, ProjectConfiguration> | undefined> {
  if (!paths) {
    return undefined;
  }
  // windows paths like /c:/Users/... aren't correctly picked up by normalize() so we need to handle them ourselves
  const pathsNormalized = paths
    .map((p) => normalize(p))
    .map((p) =>
      p.startsWith(sep) && platform() === 'win32' ? p.substring(1) : p,
    );
  workspacePath = normalize(workspacePath);
  workspacePath =
    workspacePath.startsWith(sep) && platform() === 'win32'
      ? workspacePath.substring(1)
      : workspacePath;

  const { projectGraph, projectFileMap } = await nxWorkspace(
    workspacePath,
    lspLogger,
  );
  const pathsMap = new Map<
    string,
    { relativePath: string; isDirectory: boolean }
  >();
  for (const path of pathsNormalized) {
    // lspLogger.log(
    //   `workspacePath: ${workspacePath}, path ${path}, relative: ${relative(
    //     workspacePath,
    //     path
    //   )}, isDirectory: ${await directoryExists(path)}`
    // );
    pathsMap.set(path, {
      relativePath: relative(workspacePath, path),
      isDirectory: await directoryExists(path),
    });
  }

  const projectEntries = Object.entries(projectGraph.nodes);

  const foundProjects: Map<string, ProjectConfiguration> = new Map();

  for (const [projectName, projectConfig] of projectEntries) {
    // If there is no files array, it's an old version of Nx and we need backwards compatibility
    if (!projectFileMap?.[projectName]) {
      new Map(pathsMap).forEach((_, path) => {
        const foundProject = findByFilePath(
          [projectName, projectConfig.data],
          workspacePath,
          path,
        );
        if (foundProject) {
          foundProjects.set(path, foundProject);
          pathsMap.delete(path);
        }
      });
      continue;
    }

    // project check for directories
    new Map(pathsMap).forEach(({ relativePath, isDirectory }, path) => {
      if (!isDirectory) return;

      const isChildOfRoot = isChildOrEqual(
        projectConfig.data.root,
        relativePath,
      );
      const relativeRootConfig = projectConfig.data.sourceRoot
        ? relative(workspacePath, projectConfig.data.sourceRoot)
        : undefined;
      const isChildOfRootConfig =
        relativeRootConfig && isChildOrEqual(relativeRootConfig, relativePath);

      if (isChildOfRoot || isChildOfRootConfig) {
        foundProjects.set(path, projectConfig.data);
        pathsMap.delete(path);
      }
    });

    // iterate over the project files once and find all the paths that match
    const nonDirectoryPaths = [...pathsMap.entries()].filter(
      ([_, { isDirectory }]) => !isDirectory,
    );
    projectFileMap?.[projectName]?.forEach(({ file }) => {
      for (const [path, { relativePath }] of nonDirectoryPaths) {
        if (normalize(file) === normalize(relativePath)) {
          foundProjects.set(path, projectConfig.data);
          pathsMap.delete(path);
        }
      }
    });

    if (pathsMap.size === 0) {
      break;
    }
  }

  // if a directory is not found in any projects & there's a root project, use that
  if (pathsMap.size > 0) {
    const rootProject = projectEntries.find(
      ([, projectConfig]) => projectConfig.data.root === '.',
    );
    if (rootProject) {
      new Map(pathsMap).forEach(({ isDirectory }, path) => {
        if (!isDirectory) {
          return;
        }
        foundProjects.set(path, rootProject[1].data);
        pathsMap.delete(path);
      });
    }
  }

  return Object.fromEntries(foundProjects);
}

/** This is only used for backwards compatibility  */
function findByFilePath(
  entry: [string, ProjectConfiguration] | undefined,
  workspacePath: string,
  selectedPath: string,
) {
  if (!entry) {
    return null;
  }

  let perfectMatchEntry: [string, ProjectConfiguration] | undefined;
  let secondaryMatchEntry: [string, ProjectConfiguration] | undefined;

  const [, projectConfiguration] = entry;
  const fullProjectPath = join(
    workspacePath,
    // If root is empty, that means we're in an angular project with the old ng workspace setup. Otherwise use the sourceRoot
    projectConfiguration.root || projectConfiguration.sourceRoot || '',
  );
  if (fullProjectPath === selectedPath) {
    perfectMatchEntry = entry;
  }

  const relativePath = relative(fullProjectPath, selectedPath);
  if (
    relativePath &&
    !relativePath.startsWith('..') &&
    !isAbsolute(relativePath)
  ) {
    secondaryMatchEntry = entry;
  }

  entry = perfectMatchEntry ?? secondaryMatchEntry;

  return entry ? { name: entry[0], ...entry[1] } : null;
}

function isChildOrEqual(parent: string, child: string) {
  const p = parent.endsWith(sep) ? parent : parent + sep;
  const c = child.endsWith(sep) ? child : child + sep;
  return normalize(c).startsWith(normalize(p));
}
