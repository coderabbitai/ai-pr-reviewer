# OpenAI ChatGPT-based PR reviewer and summarizer

![AI](./docs/images/ai.png)

## Overview

This [OpenAI ChatGPT-based](https://platform.openai.com/docs/guides/chat) GitHub
Action provides a summary, release notes and review of pull requests. The unique
features of this action are:

- Unlike other approaches that provide a simple summary and/or conversation,
  this action reviews the changes line by line and provides code change
  suggestions that can be directly committed from the GitHub UI. The prompts
  have been tuned carefully to comment on exact lines within changed hunks of
  code.
- Continuous, yet incremental, reviews on each commit with a pull request. This
  is unlike other approaches that provide a one-time review on the entire pull
  request when requested by the user.
- Incremental reviews save on OpenAI costs while also reducing noise. Changed
  files are tracked between commits and the base of the pull request
- The action is designed to be used with a "light" summarization model (e.g.
  `gpt-3.5-turbo`) and a "heavy" review model (e.g. `gpt-4`). This allows for a
  cheaper and faster summarization process and a more accurate review process.
- This action supports a conversation with the bot in the context of lines of
  code or entire files. Useful for providing further context to the bot for its
  next review, to generate test cases, to reduce complexity of the code and so
  on.
- By default, the action is configured to skip more in-depth review when the
  changes are simple (e.g. typo fixes). This is based on the triage done during
  the summarization stage. This feature can be disabled by setting
  `review_simple_changes` to `true`.
- By default, the action is configured to skip adding review comments when the
  changes look good for the most part. This feature can be disabled by setting
  `review_comment_lgtm` to `true`.
- You can tailor the following prompts:
  - `system_message`: Defines the objective and the personality of the bot. You
    can change this prompt to focus on or ignore certain aspects of the review
    process, e.g. documentation, code quality, etc. Furthermore, you can even
    change the bot to do marketing material review instead of code review.
  - `summarize`: Summarizes the pull request into a table of changes etc.
  - `summarize_release_notes`: Summarize the changes in the pull request for
    release notes purposes.
- You can altogether skip the reviews, setting the `summary_only` to `true`. But
  that defeats the main purpose of this action. Other tools such as GitHub's
  [Copliot for Pull Requests](https://githubnext.com/projects/copilot-for-pull-requests)
  may be a cheaper and good enough alternative in that case.

NOTES:

- Your code (files, diff, PR title/description) will be sent to OpenAI's servers
  for processing. Please check with your compliance team before using this on
  your private code repositories.
- OpenAI's API is used instead of ChatGPT session on their portal. OpenAI API
  has a
  [more conservative data usage policy](https://openai.com/policies/api-data-usage-policies)
  compared to their ChatGPT offering.
- This action is not affiliated with OpenAI.

## Usage

Add the below file to your repository at
`.github/workflows/openai-pr-reviewer.yml`

```yaml
name: Code Review

permissions:
  contents: read
  pull-requests: write

on:
  pull_request:
  pull_request_review_comment:
    types: [created]

concurrency:
  group:
    ${{ github.repository }}-${{ github.event.number || github.head_ref ||
    github.sha }}-${{ github.workflow }}-${{ github.event_name ==
    'pull_request_review_comment' && 'pr_comment' || 'pr' }}
  cancel-in-progress: ${{ github.event_name != 'pull_request_review_comment' }}

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: fluxninja/openai-pr-reviewer@latest
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          debug: false
          review_simple_changes: false
          review_comment_lgtm: false
```

### Conversation with OpenAI

You can reply to a review comment made by this action and get a response based
on the diff context. Additionally, you can invite the bot to a conversation by
tagging it in the comment (`@openai`).

Example:

> @openai Please generate a test plan for this file.

Note: A review comment is a comment made on a diff or a file in the pull
request.

### Ignoring PRs

Sometimes it is useful to ignore a PR. For example, if you are using this action
to review documentation, you can ignore PRs that only change the documentation.
To ignore a PR, add the following keyword in the PR description:

```text
@openai: ignore
```

### Screenshots

![PR Summary](./docs/images/openai-pr-summary.png)

![PR Release Notes](./docs/images/openai-pr-release-notes.png)

![PR Review](./docs/images/openai-pr-review.png)

![PR Conversation](./docs/images/openai-review-conversation.png)

#### Environment variables

- `GITHUB_TOKEN`: This should already be available to the GitHub Action
  environment. This is used to add comments to the pull request.
- `OPENAI_API_KEY`: use this to authenticate with OpenAI API. You can get one
  [here](https://platform.openai.com/account/api-keys). Please add this key to
  your GitHub Action secrets.
- `OPENAI_API_ORG`: (optional) use this to use the specified organisation with
  OpenAI API if you have multiple. Please add this key to your GitHub Action
  secrets.

### Models: `gpt-4` and `gpt-3.5-turbo`

At FluxNinja, we use `gpt-3.5-turbo` for lighter tasks such as summarizing the
changes (`openai_light_model` in configuration) and `gpt-4` for more complex
review and commenting tasks (`openai_heavy_model` in configuration).

Costs: `gpt-3.5-turbo` is dirt cheap. `gpt-4` is orders of magnitude more
expensive, but the results are vastly superior. We are typically spending $20 a
day for a 20 developer team with `gpt-4` based review and commenting.

### Prompts & Configuration

See: [action.yml](./action.yml)

Tip: You can change the bot personality by configuring the `system_message`
value. For example, to review docs/blog posts, you can use the following prompt:

<details>
<summary>Blog Reviewer Prompt</summary>

```yaml
system_message: |
  You are `@openai` (aka `github-actions[bot]`), a language model
  trained by OpenAI. Your purpose is to act as a highly experienced
  DevRel (developer relations) professional with focus on cloud-native
  infrastructure.

  Company context -
  FluxNinja is a cloud-native intelligent load management platform.
  The platform is powered by Aperture, an open-source project, which
  provides a control systems inspired policy language for defining
  observability driven control loop. FluxNinja's load management,
  such as prioritized load shedding and load-based autoscaling,
  ensures system stability. FluxNinja ARC, the commercial solution,
  offers advanced analytics, intelligent alerting, and policy
  visualization.

  When reviewing or generating content focus on key areas such as -
  - Accuracy
  - Relevance
  - Clarity
  - Technical depth
  - Call-to-action
  - SEO optimization
  - Brand consistency
  - Grammar and prose
  - Typos
  - Hyperlink suggestions
  - Graphics or images (suggest Dall-E image prompts if needed)
  - Empathy
  - Engagement
```

</details>

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

### Review pull requests from forks

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
    types: [opened, synchronize, reopened]
  pull_request_review_comment:
    types: [created]

concurrency:
  group:
    ${{ github.repository }}-${{ github.event.number || github.head_ref ||
    github.sha }}-${{ github.workflow }}-${{ github.event_name ==
    'pull_request_review_comment' && 'pr_comment' || 'pr' }}
  cancel-in-progress: ${{ github.event_name != 'pull_request_review_comment' }}

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: fluxninja/openai-pr-reviewer@latest
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          debug: false
          review_simple_changes: false
          review_comment_lgtm: false
```

See also:
https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request_target

### Inspect the messages between OpenAI server

Set `debug: true` in the workflow file to enable debug mode, which will show the
messages
