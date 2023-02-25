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
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          action: score

      - uses: unsafecoerce/chatgpt-action@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          action: review
```

Possible variables in prompt templates:

- code review (`action: review`):

  - `$title`: Title of the pull requests.
  - `$description`: The description of the pull request.
  - `$filename`: Filename of the file being viewed.
  - `$patch`: The diff contents of the patch being viewed.

- pull request score (`action: score`):

  - `$title`: Title of the pull requests.
  - `$description`: The description of the pull request.
  - `$diff`: The whole diff of the pull request.

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
