import * as core from '@actions/core'

async function run(): Promise<void> {
  try {
    const action: string = core.getInput('action')
    core.info(`running Github action: ${action}`)
    if (action === 'code-reviewer') {
    } else {
      core.warning(`unknown action: ${action}`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
