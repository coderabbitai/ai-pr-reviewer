# ChatGPT based PR reviewer and summarizer

![AI](./docs/images/ai.png)

## Overview

This [ChatGPT](https://platform.openai.com/docs/guides/chat) based GitHub Action
provides a summary, release notes and review of pull requests. The prompts have
been tuned for a concise response. To prevent excessive notifications, this
action can be configured to skip adding review comments when the changes look
good for the most part.

### Features

- Code review your pull requests

  ```yaml
  - uses: fluxninja/chatgpt-pr-reviewer@main
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
    with:
      debug: false
      review_comment_lgtm: false
  ```

## Usage

```yaml
name: Code Review

permissions:
  contents: read
  pull-requests: write

on:
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          repository: ${{github.event.pull_request.head.repo.full_name}}
          ref: ${{github.event.pull_request.head.ref}}
          submodules: false
      - uses: fluxninja/chatgpt-pr-reviewer@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          debug: false
          review_comment_lgtm: true
```

### Screenshots

![PR Summary](./docs/images/chatgpt-pr-summary.png)

![PR Release Notes](./docs/images/chatgpt-pr-release-notes.png)

![PR Review](./docs/images/chatgpt-pr-review.png)

### Configuration

See also: [./action.yml](./action.yml)

#### Environment variables

- `GITHUB_TOKEN`
- `OPENAI_API_KEY`: use this to authenticate with OpenAI API. You can get one
  [here](https://platform.openai.com/account/api-keys). Please add this key to
 
  your GitHub Action secrets.

#### Inputs

- `debug`: Enable debug mode, will show messages and responses between ChatGPT
  server in CI logs.
- `chatgpt_reverse_proxy`: The URL of the ChatGPT reverse proxy
- `review_comment_lgtm`: Leave comments even the patch is LGTM
- `path_filters`: Rules to filter files to be reviewed.
- `temperature`: Temperature of the GPT-3 model.
- `system_message`: The message to be sent to ChatGPT to start a conversation.

### Prompt templates:

See: [./action.yml](./action.yml)

Any suggestions or pull requests for improving the prompts are highly
appreciated.

## Developing

> First, you'll need to have a reasonably modern version of `node` handy, tested
> with node 16.

Install the dependencies

```bash
$ npm install
```

Build the typescript and package it for distribution

```bash
$ npm run build && npm run package
```

## FAQs

### Review pull request from forks

GitHub Actions limits the access of secrets from forked repositories. To enable
this feature, you need to use the `pull_request_target` event instead of
`pull_request` in your workflow file. Note that with `pull_request_target`, you
need extra configuration to ensure checking out the right commit:

```yaml
name: Code Review

permissions:
  contents: read
  pull-requests: write

on:
  pull_request_target:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          repository: ${{github.event.pull_request.head.repo.full_name}}
          ref: ${{github.event.pull_request.head.ref}}
          submodules: false

      - uses: fluxninja/chatgpt-pr-reviewer@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          debug: false
```

See also:
https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request_target

### Inspect the messages between ChatGPT server

Set `debug: true` in the workflow file to enable debug mode, which will show the
messages

[1]:
  https://github.com/marketplace?type=&verification=&query=chatgpt-pr-reviewer+
[2]: https://www.npmjs.com/package/chatgpt

### Special Thanks

This GitHub Action is based on
[ChatGPT Action](https://github.com/unsafecoerce/chatgpt-action) by
[Tao He](https://github.com/sighingnow).
