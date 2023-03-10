# ChatGPT based PR reviewer and summarizer

Based on [ChatGPT Action](https://github.com/unsafecoerce/chatgpt-pr-reviewer)
by [Tao He](https://github.com/sighingnow).

## Overview

### Features

- Code review your pull requests

  ```yaml
  - uses: fluxninja/chatgpt-pr-reviewer@main
    env:
      GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      CHATGPT_ACCESS_TOKEN: ${{ secrets.CHATGPT_ACCESS_TOKEN }}
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
          CHATGPT_ACCESS_TOKEN: ${{ secrets.CHATGPT_ACCESS_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          debug: false
          review_comment_lgtm: true
```

### Configuration

See also: [./action.yml](./action.yml)

#### Environment variables

- `GITHUB_TOKEN`
- `CHATGPT_ACCESS_TOKEN`: ChatGPT access token, see also: https://github.com/acheong08/ChatGPT.

  The access token can be easily obtained from https://chat.openai.com/api/auth/session after
  logging into ChatGPT.

- `OPENAI_API_KEY`: use this to authenticate with OpenAI API, official ChatGPT's behavior using
  `gpt-3.5-turbo`, see also: https://github.com/transitive-bullshit/chatgpt-api

Note that `CHATGPT_ACCESS_TOKEN` and `OPENAI_API_KEY` are not both required. Inside this action,
unofficial ChatGPT is preferred if `CHATGPT_ACCESS_TOKEN` exists. Note that the `CHATGPT_ACCESS_TOKEN`
can expire frequently, so `OPENAI_API_KEY` should be more convenient if its cost is affordable
to you.

#### Inputs

- `debug`: Enable debug mode, will show messages and responses between ChatGPT server in CI logs.
- `chatgpt_reverse_proxy`: The URL of the ChatGPT reverse proxy
- `review_comment_lgtm`: Leave comments even the patch is LGTM
- `path_filters`: Rules to filter files to be reviewed.
- `temperature`: Temperature of the GPT-3 model.
- `system_message`: The message to be sent to ChatGPT to start a conversation.

### Prompt templates:

See: [./action.yml](./action.yml)

Any suggestions or pull requests for improving the prompts are highly appreciated.

## Developing

> First, you'll need to have a reasonably modern version of `node` handy, tested with node 16.

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

See also: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request_target

### Choose the ChatGPT API implementation

The javascript's [chatgpt][2] package provides two implementations of the ChatGPT API:

- `ChatGPTAPI`: official ChatGPT using the OpenAI's `gpt-3.5-turbo`.
  - not free
  - requires `OPENAI_API_KEY`
- `ChatGPTUnofficialProxyAPI`: unofficial ChatGPT models, rely on third-party server and is
  rate limited.
  - free
  - requires `CHATGPT_ACCESS_TOKEN`
  - the proxy server is configurable using `chatgpt_reverse_proxy`

If both environment variables `OPENAI_API_KEY` and `CHATGPT_ACCESS_TOKEN` exists, we
prefer the `ChatGPTUnofficialProxyAPI` implementation.

### Inspect the messages between ChatGPT server

Set `debug: true` in the workflow file to enable debug mode, which will show the messages

[1]: https://github.com/marketplace?type=&verification=&query=chatgpt-pr-reviewer+
[2]: https://www.npmjs.com/package/chatgpt
