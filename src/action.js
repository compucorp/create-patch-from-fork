const core = require('@actions/core');
const github = require('@actions/github');
const exec = require('@actions/exec');
const path = require('path');
const fs = require('fs');

/**
 * Returns the path to workspace in which the job will run
 */
function getGithubWorkspace () {
  let githubWorkspacePath = process.env.GITHUB_WORKSPACE;
  if (!githubWorkspacePath) {
    throw new Error('GITHUB_WORKSPACE not defined');
  }
  githubWorkspacePath = path.resolve(githubWorkspacePath);
  console.log({ githubWorkspacePath });

  return githubWorkspacePath;
}

/**
 * Returns the direction where the project to be patched is located.
 *
 * @returns {string}
 *  The path to the project.
 */
function getProjectDir () {
  // The project dir should always be relative to the build workspace,
  // so first we need to get the path to the workspace.
  return getGithubWorkspace() + path.sep + core.getInput('project_dir');
}

/**
 * When patching a CiviCRM Core project, this will update the patch version in the
 * version.xml file, so that it's easy to figure out which version of the patch
 * has been applied to a specific site.
 *
 * @param {string} projectDir
 *  The directory with the project files to be patched.
 * @param {string} version
 *  The patch version. See getPatchVersion()
 */
async function setCiviCrmVersion (projectDir, version) {
  await exec.exec(
    'sed',
    [
      '-i',
      `s@</version_no>@<!-- ${version} --></version_no>@g`,
      'xml/version.xml'
    ],
    { cwd: projectDir });
}

/**
 * Sets the patch version in the module .info file.
 *
 * @param {string} projectDir
 *  The directory with the project files to be patched.
 * @param {string} patchVersion
 *  The patch version. See getPatchVersion()
 */
async function setDrupalModulePatchVersion (projectDir, patchVersion) {
  fs.readdir(projectDir, (err, files) => {
    if (err) {
      core.setFailed(err.message);
    }

    files.forEach((file) => {
      if (file.endsWith('.info')) {
        fs.appendFileSync(projectDir + path.sep + file, `;patch = ${patchVersion}`);
      }
    });
  });
}

/**
 * Creates a patch file, based on the patches branch for the given
 * baseVersion
 *
 * @param {string} projectDir
 *  The directory with the project files to be patched.
 * @param {string} baseVersion
 *  The baseVersion from which the patch will be created.
 * @returns {Promise<string>}
 *  The path to the patch file.
 */
async function createPatchFile (projectDir, baseVersion) {
  const patchFile = projectDir + path.sep + 'patch.diff';

  let patchContent = '';
  await exec.exec('git', [
    '--no-pager',
    'diff',
    '-p',
    '..origin/' + baseVersion + '-patches',
    ':!.github'
  ], {
    listeners: {
      stdout: (data) => { patchContent += data.toString(); }
    }
  });

  fs.writeFileSync(patchFile, patchContent);

  return patchFile;
}

/**
 * Patch files in the given project dir. The patch will be created from the
 * patches branch of the given baseVersion.
 *
 * @param {string} projectDir
 *  The directory with the project files to be patched.
 * @param {string} baseVersion
 *  The baseVersion from which the patch will be created.
 */
async function patchProject (projectDir, baseVersion) {
  const patchFile = await createPatchFile(projectDir, baseVersion);

  await exec.exec(`patch -p1 -i ${patchFile}`, null, { cwd: projectDir });
  await exec.exec(`rm ${patchFile}`, null, { cwd: projectDir });
}

/**
 * Returns the patch version, which is basically the baseVersion + "+patch." +
 * the short hash of the commit from which the patch was generated.
 *
 * @param {string} baseVersion
 *  The baseVersion from which the patch will be created.
 * @returns {string}
 *  The patch version.
 */
function getPatchVersion (baseVersion) {
  const patchCommitHash = github.context.sha.substr(0, 6);

  return `${baseVersion}+patch.${patchCommitHash}`;
}

/**
 * Sets the patch version inside a file in the project.
 *
 * The file in which this information will be set depends on the project type. For
 * CiviCRM Core it's set inside xml/version.xml. For Drupal modules it's set inside
 * the .info file and for CiviCRM extensions it's set inside the info.xml file.
 *
 * @param {string} projectDir
 *  The directory with the project files to be patched.
 * @param {string} patchVersion
 *  The patch version (i.e. the commit in the patches repo from which the patch was created).
 */
async function setPatchVersionInformationInTheProject (projectDir, patchVersion) {
  const projectType = core.getInput('project_type');

  switch (projectType) {
    case 'civicrm-core':
      await setCiviCrmVersion(projectDir, patchVersion);
      break;
    case 'drupal-module':
      await setDrupalModulePatchVersion(projectDir, patchVersion);
      break;
    case 'civicrm-extension':
      break;
    default:
      core.setFailed('Non-recognized project type!');
  }
}

/**
 * Creates a package with the patched files.
 *
 * @param {string} projectName
 *  The name of the project to be added the package file name.
 * @param {string} patchVersion
 *  The version of the patch to be added to the package file name.
 * @param {string} projectDir
 *  The directory with the files to be packaged.
 *
 * @returns {{packageFile: string, packagePath: string}}
 */
async function packageFiles (projectName, patchVersion, projectDir) {
  const packageFile = `${projectName}-${patchVersion}.tar.gz`;
  const packagePath = getGithubWorkspace() + path.sep + packageFile;
  const projectDirParent = path.dirname(projectDir);
  const dirToPackage = path.basename(projectDir);

  await exec.exec(
    'tar',
    [
      'czf',
      packagePath,
      dirToPackage
    ],
    { cwd: projectDirParent }
  );

  return {
    packageFile,
    packagePath
  };
}

/**
 * Runs the job.
 */
async function run () {
  const baseVersion = core.getInput('base_version');
  const projectDir = getProjectDir();
  const patchVersion = getPatchVersion(baseVersion);
  const projectName = core.getInput('project_name') || github.context.repo.repo;

  await patchProject(projectDir, baseVersion);
  await setPatchVersionInformationInTheProject(projectDir, patchVersion);

  const { packageFile, packagePath } = await packageFiles(projectName, patchVersion, projectDir);

  core.setOutput('version', patchVersion);
  core.setOutput('package', packageFile);
  core.setOutput('package_path', packagePath);
}

module.exports = run;
