import * as core from '@actions/core'
import * as github from '@actions/github'
import {Octokit} from '@octokit/action'

const token = core.getInput('token')
  ? core.getInput('token')
  : process.env.GITHUB_TOKEN
const octokit = new Octokit({auth: `token ${token}`})
const context = github.context
const repo = context.repo

export const COMMENT_GREETING = `:robot: OpenAI`

export const COMMENT_TAG =
  '<!-- This is an auto-generated comment by OpenAI -->'

export const COMMENT_REPLY_TAG =
  '<!-- This is an auto-generated reply by OpenAI -->'

export const DESCRIPTION_TAG =
  '<!-- This is an auto-generated comment: release notes by openai -->'
export const DESCRIPTION_TAG_END =
  '<!-- end of auto-generated comment: release notes by openai -->'

export class Commenter {
  /**
   * @param mode Can be "create", "replace", "append" and "prepend". Default is "replace".
   */
  async comment(message: string, tag: string, mode: string) {
    await this.post_comment(message, tag, mode)
  }

  get_description(description: string) {
    // remove our summary from description by looking for description_tag and description_tag_end
    const start = description.indexOf(DESCRIPTION_TAG)
    const end = description.indexOf(DESCRIPTION_TAG_END)
    if (start >= 0 && end >= 0) {
      return (
        description.slice(0, start) +
        description.slice(end + DESCRIPTION_TAG_END.length)
      )
    }
    return description
  }

  async update_description(pull_number: number, message: string) {
    // add this response to the description field of the PR as release notes by looking
    // for the tag (marker)
    try {
      // get latest description from PR
      const pr = await octokit.pulls.get({
        owner: repo.owner,
        repo: repo.repo,
        pull_number
      })
      let body = ''
      if (pr.data.body) {
        body = pr.data.body
      }
      const description = this.get_description(body)

      // find the tag in the description and replace the content between the tag and the tag_end
      // if not found, add the tag and the content to the end of the description
      const tag_index = description.indexOf(DESCRIPTION_TAG)
      const tag_end_index = description.indexOf(DESCRIPTION_TAG_END)
      const comment = `\n\n${DESCRIPTION_TAG}\n${message}\n${DESCRIPTION_TAG_END}`
      if (tag_index === -1 || tag_end_index === -1) {
        let new_description = description
        new_description += comment
        await octokit.pulls.update({
          owner: repo.owner,
          repo: repo.repo,
          pull_number,
          body: new_description
        })
      } else {
        let new_description = description.substring(0, tag_index)
        new_description += comment
        new_description += description.substring(
          tag_end_index + DESCRIPTION_TAG_END.length
        )
        await octokit.pulls.update({
          owner: repo.owner,
          repo: repo.repo,
          pull_number,
          body: new_description
        })
      }
    } catch (e: any) {
      core.warning(
        `Failed to get PR: ${e}, skipping adding release notes to description.`
      )
    }
  }

  async review_comment(
    pull_number: number,
    commit_id: string,
    path: string,
    line: number,
    message: string,
    tag: string = COMMENT_TAG
  ) {
    message = `${COMMENT_GREETING}

${message}

${tag}`
    // replace comment made by this action
    try {
      const comments = await this.list_review_comments(pull_number)
      for (const comment of comments) {
        if (comment.path === path && comment.position === line) {
          // look for tag
          if (comment.body && comment.body.includes(tag)) {
            await octokit.pulls.updateReviewComment({
              owner: repo.owner,
              repo: repo.repo,
              comment_id: comment.id,
              body: message
            })
            return
          }
        }
      }

      await octokit.pulls.createReviewComment({
        owner: repo.owner,
        repo: repo.repo,
        pull_number,
        body: message,
        commit_id,
        path,
        line
      })
    } catch (e: any) {
      core.warning(`Failed to post review comment: ${e}`)
    }
  }

  async getConversationChain(pull_number: number, comment: any) {
    try {
      const reviewComments = await this.list_review_comments(pull_number)
      const topLevelComment = await this.getTopLevelComment(
        reviewComments,
        comment
      )

      const conversationChain = reviewComments
        .filter((cmt: any) => cmt.in_reply_to_id === topLevelComment.id)
        .map((cmt: any) => `${cmt.user.login}: ${cmt.body}`)

      conversationChain.unshift(
        `${topLevelComment.user.login}: ${topLevelComment.body}`
      )

      return {
        chain: conversationChain.join('\n---\n'),
        topLevelComment
      }
    } catch (e: any) {
      core.warning(`Failed to get conversation chain: ${e}`)
      return {
        chain: '',
        topLevelComment: null
      }
    }
  }

  async getTopLevelComment(reviewComments: any[], comment: any) {
    let topLevelComment = comment

    while (topLevelComment.in_reply_to_id) {
      const parentComment = reviewComments.find(
        (cmt: any) => cmt.id === topLevelComment.in_reply_to_id
      )

      if (parentComment) {
        topLevelComment = parentComment
      } else {
        break
      }
    }

    return topLevelComment
  }

  async list_review_comments(target: number, page: number = 1) {
    const comments: any[] = []
    try {
      let data
      do {
        ;({data} = await octokit.pulls.listReviewComments({
          owner: repo.owner,
          repo: repo.repo,
          pull_number: target,
          page,
          per_page: 100
        }))
        comments.push(...data)
        page++
      } while (data.length >= 100)

      return comments
    } catch (e: any) {
      console.warn(`Failed to list review comments: ${e}`)
      return comments
    }
  }

  async post_comment(message: string, tag: string, mode: string) {
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
      tag = COMMENT_TAG
    }

    const body = `${COMMENT_GREETING}

${message}

${tag}`

    if (mode === 'create') {
      await this.create(body, target)
    } else if (mode === 'replace') {
      await this.replace(body, tag, target)
    } else if (mode === 'append') {
      await this.append(body, tag, target)
    } else if (mode === 'prepend') {
      await this.prepend(body, tag, target)
    } else {
      core.warning(`Unknown mode: ${mode}, use "replace" instead`)
      await this.replace(body, tag, target)
    }
  }

  async create(body: string, target: number) {
    try {
      await octokit.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        issue_number: target,
        body
      })
    } catch (e: any) {
      core.warning(`Failed to create comment: ${e}`)
    }
  }

  async replace(body: string, tag: string, target: number) {
    try {
      const cmt = await this.find_comment_with_tag(tag, target)
      if (cmt) {
        await octokit.issues.updateComment({
          owner: repo.owner,
          repo: repo.repo,
          comment_id: cmt.id,
          body
        })
      } else {
        await this.create(body, target)
      }
    } catch (e: any) {
      core.warning(`Failed to replace comment: ${e}`)
    }
  }

  async append(body: string, tag: string, target: number) {
    try {
      const cmt = await this.find_comment_with_tag(tag, target)
      if (cmt) {
        await octokit.issues.updateComment({
          owner: repo.owner,
          repo: repo.repo,
          comment_id: cmt.id,
          body: `${cmt.body} ${body}`
        })
      } else {
        await this.create(body, target)
      }
    } catch (e: any) {
      core.warning(`Failed to append comment: ${e}`)
    }
  }

  async prepend(body: string, tag: string, target: number) {
    try {
      const cmt = await this.find_comment_with_tag(tag, target)
      if (cmt) {
        await octokit.issues.updateComment({
          owner: repo.owner,
          repo: repo.repo,
          comment_id: cmt.id,
          body: `${body} ${cmt.body}`
        })
      } else {
        await this.create(body, target)
      }
    } catch (e: any) {
      core.warning(`Failed to prepend comment: ${e}`)
    }
  }

  async find_comment_with_tag(tag: string, target: number) {
    try {
      const comments = await this.list_comments(target)
      for (const cmt of comments) {
        if (cmt.body && cmt.body.includes(tag)) {
          return cmt
        }
      }

      return null
    } catch (e: any) {
      core.warning(`Failed to find comment with tag: ${e}`)
      return null
    }
  }

  async list_comments(target: number, page: number = 1) {
    const comments: any[] = []
    try {
      let data
      do {
        ;({data} = await octokit.issues.listComments({
          owner: repo.owner,
          repo: repo.repo,
          issue_number: target,
          page,
          per_page: 100
        }))

        comments.push(...data)
        page++
      } while (data.length >= 100)

      return comments
    } catch (e: any) {
      console.warn(`Failed to list comments: ${e}`)
      return comments
    }
  }
}
