# ChatGPT actions

A collection of ChatGPT assistants, e.g., code viewer, labeler, assigner, etc.

## Usage

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
      - uses: unsafecoerce/chatgpt-action@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CHATGPT_ACCESS_TOKEN: ${{ secrets.CHATGPT_ACCESS_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          action: score

      - uses: unsafecoerce/chatgpt-action@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CHATGPT_ACCESS_TOKEN: ${{ secrets.CHATGPT_ACCESS_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          action: review
```

### Configuration

See also: [./action.yml](./action.yml)

#### Environment variables

- `GITHUB_TOKEN`
- `CHATGPT_ACCESS_TOKEN`: chatgpt access token, see also: https://github.com/acheong08/ChatGPT
- `OPENAI_API_KEY`: use this to authenticate with OpenAI API, mimic chatgpt's behavior using `text-davinci-003`

Inside this action, ChatGPT is preferred over mimic ChatGPT when `CHATGPT_ACCESS_TOKEN` presents.

#### Inputs

- `action`: The action to run, currently can be `review`, `score`
- `debug`: Enable debug mode
- `chatgpt_reverse_proxy`: The URL of the chatgpt reverse proxy
- `review_comment_lgtm`: Leave comments even the patch is LGTM

### Prompt templates:

See also: [./action.yml](./action.yml)

- `review_beginning`: The beginning prompt of a code review dialog
- `review_patch`: The prompt for each chunks/patches
- `scoring`: The prompt for the whole pull request

#### Variables available in prompt templates

- pull request score (`action: score`):

  - `$title`: Title of the pull requests.
  - `$description`: The description of the pull request.
  - `$diff`: The whole diff of the pull request.

- code review (`action: review`):

  - `$title`: Title of the pull requests.
  - `$description`: The description of the pull request.
  - `$filename`: Filename of the file being viewed.
  - `$patch`: The diff contents of the patch being viewed.

## Developing

> First, you'll need to have a reasonably modern version of `node` handy. This won't work with versions older than 9, for instance.

Install the dependencies

```bash
$ npm install
```

Build the typescript and package it for distribution

```bash
$ npm run build && npm run package
```
