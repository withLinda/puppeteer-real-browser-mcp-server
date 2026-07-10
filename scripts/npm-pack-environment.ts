/**
 * npm converts npm_config_* environment variables into child-command settings.
 * Keep the nested package smoke tarball real even when the outer pack is a dry-run.
 * Source: https://docs.npmjs.com/cli/using-npm/config/#environment-variables
 */
export function environmentForNestedNpmPack(
  baseEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = {
    ...baseEnvironment,
    npm_config_dry_run: 'false',
  };

  delete environment.NPM_CONFIG_DRY_RUN;
  return environment;
}
