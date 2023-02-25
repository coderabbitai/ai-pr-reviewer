import * as core from '@actions/core'
import { Octokit } from '@octokit/action';

import './fetch-polyfill.js'
import { Bot } from './bot.js';
import { codeReview } from './codereview.js';

async function run(): Promise<void> {
  const octokit = new Octokit();

  // initialize chatgpt bot
  var bot: Bot;
  try {
    bot = new Bot(core.getInput('openai_api_key'));
  } catch (e) {
    core.warning(`Skipped: failed to create bot, please check your openai_api_key: ${e}`);
    return;
  }

  try {
    const action: string = core.getInput('action');
    const prompt: string = core.getInput('prompt');
    const promptSuffix: string = core.getInput('prompt_suffix');

    core.info(`running Github action: ${action}`)
    if (action === 'code-review') {
      codeReview(bot, prompt, promptSuffix, octokit);
    } else {
      core.warning(`unknown action: ${action}`)
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message)
    }
  }
}

run()
