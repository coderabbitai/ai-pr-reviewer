name: Tag latest

on:
  release:
    types: [published, edited]

jobs:
  actions-tagger:
    runs-on: windows-latest
    steps:
      - uses: Actions-R-Us/actions-tagger@latest
        with:
          publish_latest_tag: true
