import { Platform } from '@expo/build-tools';
import { ApiV2 } from '@expo/xdl';
import { Command } from 'commander';

import log from '../../log';
import { CredentialsSource } from '../../credentials/credentials';
import { createBuilderContextAsync, startBuildAsync, waitForBuildEndAsync } from './build';
import { AndroidBuilder } from './android';
import { iOSBuilder } from './ios';
import { printBuildTable } from './utils';

interface AndroidGenericScopedOptions {
  android: {
    artifactPath: string;
    buildCommand: string;
  };
}
interface AndroidManagedScopedOptions {
  android: {
    buildType: 'apk' | 'app-bundle';
  };
}

interface iOSManagedScopedOptions {
  ios?: {
    buildType: 'archive' | 'simulator';
  };
}

interface Options {
  platform: Platform | 'all';
  credentialsSource: CredentialsSource;
  skipCredentialsCheck: boolean;
  noWait: boolean;
}

async function buildAction(projectDir: string, options: Options): Promise<void> {
  const { platform, noWait } = options;
  const ctx = await createBuilderContextAsync(projectDir);
  const client = ApiV2.clientForUser(ctx.user);
  const scheduledBuilds: Array<{ platform: Platform; buildId: string }> = [];

  if ([Platform.Android, 'all'].includes(platform)) {
    const builder = new AndroidBuilder(ctx, options);
    const buildId = await startBuildAsync(client, builder);
    scheduledBuilds.push({ platform: Platform.Android, buildId });
  }
  if ([Platform.iOS, 'all'].includes(platform)) {
    const builder = new iOSBuilder(ctx, options);
    const buildId = await startBuildAsync(client, builder);
    scheduledBuilds.push({ platform: Platform.iOS, buildId });
  }
  if (options.noWait) {
    if (scheduledBuilds.length === 1) {
      log(`Logs url: ${scheduledBuilds[0].buildId}`); // replace with logs url
    } else {
      scheduledBuilds.forEach(build => {
        log(`Platform: ${build.platform}, Logs url: ${build.buildId}`); // replace with logs url
      });
    }
  } else {
    const buildInfo = await waitForBuildEndAsync(
      client,
      ctx.projectDir,
      scheduledBuilds.map(i => i.buildId)
    );
    if (buildInfo.length === 1) {
      log(`Artifact url: ${buildInfo[0]?.artifacts?.buildUrl ?? ''}`);
    } else {
      buildInfo.forEach(build => {
        log(`Platform: ${build?.platform}, Artifact url: ${build?.artifacts?.buildUrl ?? ''}`);
      });
    }
  }
}

async function statusAction(projectDir: string): Promise<void> {
  throw new Error('not implemented yet');
  // const ctx = await createBuilderContextAsync(projectDir);
  // const result = await builder.getLatestBuildsAsync();
  // printBuildTable(result.builds);
}

export default function (program: Command) {
  program
    .command('build [project-dir]')
    .description(
      'Build an app binary for your project, signed and ready for submission to the Google Play Store.'
    )
    .requiredOption(
      '-p --platform <platform>',
      'Platform: [android|ios|all]',
      /^(android|ios|all)$/i
    )
    .option(
      '-s --credentials-source <source>',
      'sources: [local|remote|auto]',
      /^(local|remote|auto)$/i,
      CredentialsSource.AUTO
    )
    .option('--skip-credentials-check', 'Skip checking credentials', false)
    .option('--no-wait', 'Exit immediately after triggering build.', false)
    .scopedOption(
      'android:generic',
      '--build-command',
      'Name of the gradle task (defaults to ":app:assembleRelease")'
    )
    .scopedOption(
      'android:generic',
      '--artifact-path',
      'Name of the gradle task (defaults to "android/app/build/outputs/apk/release/app-release.apk")'
    )
    .scopedOption('android:managed', '-t --build-type', 'Type of build: [app-bundle|apk].')
    .scopedOption('ios:managed', '-t --build-type', 'Type of build: [archive|simulator].')
    .asyncActionProjectDir(buildAction, { checkConfig: true });

  program
    .command('build:status')
    .description(`Get the status of the latest builds for your project.`)
    .asyncActionProjectDir(statusAction, { checkConfig: true });
}
