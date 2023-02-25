import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN
const octokit = new Octokit({auth: `token ${token}`})
const context = github.context
const repo = context.repo

const DEFAULT_TAG = '<!-- This is an auto-generated comment -->'

export class Commenter {
  /**
   * @param mode Can be "create", "replace", "append" and "prepend". Default is "replace".
   */
  public async comment(message: string, tag: string, mode: string) {
    await comment(message, tag, mode)
  }

  public async review_comment(
    pull_number: number,
    commit_id: string,
    path: string,
    line: number,
    message: string
  ) {
    await octokit.pulls.createReviewComment({
      owner: repo.owner,
      repo: repo.repo,
      pull_number: pull_number,
      body: message,
      commit_id: commit_id,
      path: path,
      line: line
    })
  }
}

const comment = async (message: string, tag: string, mode: string) => {
  let target: number
  if (context.payload.pull_request) {
    target = context.payload.pull_request.number
  } else if (context.payload.issue) {
    target = context.payload.issue.number
  } else {
    core.warning(
      `Skipped: context.payload.pull_request and context.payload.issue are both null`
    )
    return
  }

  if (!tag) {
    tag = DEFAULT_TAG
  }

  const body = `${message}

${tag}`

  if (mode == 'create') {
    await create(body, tag, target)
  } else if (mode == 'replace') {
    await replace(body, tag, target)
  } else if (mode == 'append') {
    await append(body, tag, target)
  } else if (mode == 'prepend') {
    await prepend(body, tag, target)
  } else {
    core.warning(`Unknown mode: ${mode}, use "replace" instead`)
    await replace(body, tag, target)
  }
}

const create = async (body: string, tag: string, target: number) => {
  await octokit.issues.createComment({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: target,
    body: body
  })
}

const replace = async (body: string, tag: string, target: number) => {
  const comment = await find_comment_with_tag(tag, target)
  if (comment) {
    await octokit.issues.updateComment({
      owner: repo.owner,
      repo: repo.repo,
      comment_id: comment.id,
      body: body
    })
  } else {
    await create(body, tag, target)
  }
}

const append = async (body: string, tag: string, target: number) => {
  const comment = await find_comment_with_tag(tag, target)
  if (comment) {
    await octokit.issues.updateComment({
      owner: repo.owner,
      repo: repo.repo,
      comment_id: comment.id,
      body: `${comment.body} ${body}`
    })
  } else {
    await create(body, tag, target)
  }
}

const prepend = async (body: string, tag: string, target: number) => {
  const comment = await find_comment_with_tag(tag, target)
  if (comment) {
    await octokit.issues.updateComment({
      owner: repo.owner,
      repo: repo.repo,
      comment_id: comment.id,
      body: `${body} ${comment.body}`
    })
  } else {
    await create(body, tag, target)
  }
}

const find_comment_with_tag = async (tag: string, target: number) => {
  const comments = await list_comments(target)
  for (let comment of comments) {
    if (comment.body && comment.body.includes(tag)) {
      return comment
    }
  }
  return null
}

const list_comments = async (target: number, page: number = 1) => {
  let {data: comments} = await octokit.issues.listComments({
    owner: repo.owner,
    repo: repo.repo,
    issue_number: target,
    page: page,
    per_page: 100
  })
  if (!comments) {
    return []
  }
  if (comments.length >= 100) {
    comments = comments.concat(await list_comments(target, page + 1))
    return comments
  } else {
    return comments
  }
}
