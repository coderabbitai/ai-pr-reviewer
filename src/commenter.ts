import {getInput, info, warning} from '@actions/core'
// eslint-disable-next-line camelcase
import {context as github_context} from '@actions/github'
import {octokit} from './octokit'

// eslint-disable-next-line camelcase
const context = github_context
const repo = context.repo

export const COMMENT_GREETING = `${getInput('bot_icon')}   CodeRabbit`

export const COMMENT_TAG =
  '<!-- This is an auto-generated comment by OSS CodeRabbit -->'

export const COMMENT_REPLY_TAG =
  '<!-- This is an auto-generated reply by OSS CodeRabbit -->'

export const SUMMARIZE_TAG =
  '<!-- This is an auto-generated comment: summarize by OSS CodeRabbit -->'

export const IN_PROGRESS_START_TAG =
  '<!-- This is an auto-generated comment: summarize review in progress by OSS CodeRabbit -->'

export const IN_PROGRESS_END_TAG =
  '<!-- end of auto-generated comment: summarize review in progress by OSS CodeRabbit -->'

export const DESCRIPTION_START_TAG =
  '<!-- This is an auto-generated comment: release notes by OSS CodeRabbit -->'
export const DESCRIPTION_END_TAG =
  '<!-- end of auto-generated comment: release notes by OSS CodeRabbit -->'

export const RAW_SUMMARY_START_TAG = `<!-- This is an auto-generated comment: raw summary by OSS CodeRabbit -->
<!--
`
export const RAW_SUMMARY_END_TAG = `-->
<!-- end of auto-generated comment: raw summary by OSS CodeRabbit -->`

export const SHORT_SUMMARY_START_TAG = `<!-- This is an auto-generated comment: short summary by OSS CodeRabbit -->
<!--
`

export const SHORT_SUMMARY_END_TAG = `-->
<!-- end of auto-generated comment: short summary by OSS CodeRabbit -->`

export const COMMIT_ID_START_TAG = '<!-- commit_ids_reviewed_start -->'
export const COMMIT_ID_END_TAG = '<!-- commit_ids_reviewed_end -->'

export class Commenter {
  /**
   * @param mode Can be "create", "replace". Default is "replace".
   */
  async comment(message: string, tag: string, mode: string) {
    let target: number
    if (context.payload.pull_request != null) {
      target = context.payload.pull_request.number
    } else if (context.payload.issue != null) {
      target = context.payload.issue.number
    } else {
      warning(
        'Skipped: context.payload.pull_request and context.payload.issue are both null'
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
    } else {
      warning(`Unknown mode: ${mode}, use "replace" instead`)
      await this.replace(body, tag, target)
    }
  }

  getContentWithinTags(content: string, startTag: string, endTag: string) {
    const start = content.indexOf(startTag)
    const end = content.indexOf(endTag)
    if (start >= 0 && end >= 0) {
      return content.slice(start + startTag.length, end)
    }
    return ''
  }

  removeContentWithinTags(content: string, startTag: string, endTag: string) {
    const start = content.indexOf(startTag)
    const end = content.lastIndexOf(endTag)
    if (start >= 0 && end >= 0) {
      return content.slice(0, start) + content.slice(end + endTag.length)
    }
    return content
  }

  getRawSummary(summary: string) {
    return this.getContentWithinTags(
      summary,
      RAW_SUMMARY_START_TAG,
      RAW_SUMMARY_END_TAG
    )
  }

  getShortSummary(summary: string) {
    return this.getContentWithinTags(
      summary,
      SHORT_SUMMARY_START_TAG,
      SHORT_SUMMARY_END_TAG
    )
  }

  getDescription(description: string) {
    return this.removeContentWithinTags(
      description,
      DESCRIPTION_START_TAG,
      DESCRIPTION_END_TAG
    )
  }

  getReleaseNotes(description: string) {
    const releaseNotes = this.getContentWithinTags(
      description,
      DESCRIPTION_START_TAG,
      DESCRIPTION_END_TAG
    )
    return releaseNotes.replace(/(^|\n)> .*/g, '')
  }

  async updateDescription(pullNumber: number, message: string) {
    // add this response to the description field of the PR as release notes by looking
    // for the tag (marker)
    try {
      // get latest description from PR
      const pr = await octokit.pulls.get({
        owner: repo.owner,
        repo: repo.repo,
        // eslint-disable-next-line camelcase
        pull_number: pullNumber
      })
      let body = ''
      if (pr.data.body) {
        body = pr.data.body
      }
      const description = this.getDescription(body)

      const messageClean = this.removeContentWithinTags(
        message,
        DESCRIPTION_START_TAG,
        DESCRIPTION_END_TAG
      )
      const newDescription = `${description}\n${DESCRIPTION_START_TAG}\n${messageClean}\n${DESCRIPTION_END_TAG}`
      await octokit.pulls.update({
        owner: repo.owner,
        repo: repo.repo,
        // eslint-disable-next-line camelcase
        pull_number: pullNumber,
        body: newDescription
      })
    } catch (e) {
      warning(
        `Failed to get PR: ${e}, skipping adding release notes to description.`
      )
    }
  }

  private readonly reviewCommentsBuffer: Array<{
    path: string
    startLine: number
    endLine: number
    message: string
  }> = []

  async bufferReviewComment(
    path: string,
    startLine: number,
    endLine: number,
    message: string
  ) {
    message = `${COMMENT_GREETING}

${message}

${COMMENT_TAG}`
    this.reviewCommentsBuffer.push({
      path,
      startLine,
      endLine,
      message
    })
  }

  async deletePendingReview(pullNumber: number) {
    try {
      const reviews = await octokit.pulls.listReviews({
        owner: repo.owner,
        repo: repo.repo,
        // eslint-disable-next-line camelcase
        pull_number: pullNumber
      })

      const pendingReview = reviews.data.find(
        review => review.state === 'PENDING'
      )

      if (pendingReview) {
        info(
          `Deleting pending review for PR #${pullNumber} id: ${pendingReview.id}`
        )
        try {
          await octokit.pulls.deletePendingReview({
            owner: repo.owner,
            repo: repo.repo,
            // eslint-disable-next-line camelcase
            pull_number: pullNumber,
            // eslint-disable-next-line camelcase
            review_id: pendingReview.id
          })
        } catch (e) {
          warning(`Failed to delete pending review: ${e}`)
        }
      }
    } catch (e) {
      warning(`Failed to list reviews: ${e}`)
    }
  }

  async submitReview(pullNumber: number, commitId: string, statusMsg: string) {
    const body = `${COMMENT_GREETING}

${statusMsg}
`

    if (this.reviewCommentsBuffer.length === 0) {
      // Submit empty review with statusMsg
      info(`Submitting empty review for PR #${pullNumber}`)
      try {
        await octokit.pulls.createReview({
          owner: repo.owner,
          repo: repo.repo,
          // eslint-disable-next-line camelcase
          pull_number: pullNumber,
          // eslint-disable-next-line camelcase
          commit_id: commitId,
          event: 'COMMENT',
          body
        })
      } catch (e) {
        warning(`Failed to submit empty review: ${e}`)
      }
      return
    }
    for (const comment of this.reviewCommentsBuffer) {
      const comments = await this.getCommentsAtRange(
        pullNumber,
        comment.path,
        comment.startLine,
        comment.endLine
      )
      for (const c of comments) {
        if (c.body.includes(COMMENT_TAG)) {
          info(
            `Deleting review comment for ${comment.path}:${comment.startLine}-${comment.endLine}: ${comment.message}`
          )
          try {
            await octokit.pulls.deleteReviewComment({
              owner: repo.owner,
              repo: repo.repo,
              // eslint-disable-next-line camelcase
              comment_id: c.id
            })
          } catch (e) {
            warning(`Failed to delete review comment: ${e}`)
          }
        }
      }
    }

    await this.deletePendingReview(pullNumber)

    const generateCommentData = (comment: any) => {
      const commentData: any = {
        path: comment.path,
        body: comment.message,
        line: comment.endLine
      }

      if (comment.startLine !== comment.endLine) {
        // eslint-disable-next-line camelcase
        commentData.start_line = comment.startLine
        // eslint-disable-next-line camelcase
        commentData.start_side = 'RIGHT'
      }

      return commentData
    }

    try {
      const review = await octokit.pulls.createReview({
        owner: repo.owner,
        repo: repo.repo,
        // eslint-disable-next-line camelcase
        pull_number: pullNumber,
        // eslint-disable-next-line camelcase
        commit_id: commitId,
        comments: this.reviewCommentsBuffer.map(comment =>
          generateCommentData(comment)
        )
      })

      info(
        `Submitting review for PR #${pullNumber}, total comments: ${this.reviewCommentsBuffer.length}, review id: ${review.data.id}`
      )

      await octokit.pulls.submitReview({
        owner: repo.owner,
        repo: repo.repo,
        // eslint-disable-next-line camelcase
        pull_number: pullNumber,
        // eslint-disable-next-line camelcase
        review_id: review.data.id,
        event: 'COMMENT',
        body
      })
    } catch (e) {
      warning(
        `Failed to create review: ${e}. Falling back to individual comments.`
      )
      await this.deletePendingReview(pullNumber)
      let commentCounter = 0
      for (const comment of this.reviewCommentsBuffer) {
        info(
          `Creating new review comment for ${comment.path}:${comment.startLine}-${comment.endLine}: ${comment.message}`
        )
        const commentData: any = {
          owner: repo.owner,
          repo: repo.repo,
          // eslint-disable-next-line camelcase
          pull_number: pullNumber,
          // eslint-disable-next-line camelcase
          commit_id: commitId,
          ...generateCommentData(comment)
        }

        try {
          await octokit.pulls.createReviewComment(commentData)
        } catch (ee) {
          warning(`Failed to create review comment: ${ee}`)
        }

        commentCounter++
        info(
          `Comment ${commentCounter}/${this.reviewCommentsBuffer.length} posted`
        )
      }
    }
  }

  async reviewCommentReply(
    pullNumber: number,
    topLevelComment: any,
    message: string
  ) {
    const reply = `${COMMENT_GREETING}

${message}

${COMMENT_REPLY_TAG}
`
    try {
      // Post the reply to the user comment
      await octokit.pulls.createReplyForReviewComment({
        owner: repo.owner,
        repo: repo.repo,
        // eslint-disable-next-line camelcase
        pull_number: pullNumber,
        body: reply,
        // eslint-disable-next-line camelcase
        comment_id: topLevelComment.id
      })
    } catch (error) {
      warning(`Failed to reply to the top-level comment ${error}`)
      try {
        await octokit.pulls.createReplyForReviewComment({
          owner: repo.owner,
          repo: repo.repo,
          // eslint-disable-next-line camelcase
          pull_number: pullNumber,
          body: `Could not post the reply to the top-level comment due to the following error: ${error}`,
          // eslint-disable-next-line camelcase
          comment_id: topLevelComment.id
        })
      } catch (e) {
        warning(`Failed to reply to the top-level comment ${e}`)
      }
    }
    try {
      if (topLevelComment.body.includes(COMMENT_TAG)) {
        // replace COMMENT_TAG with COMMENT_REPLY_TAG in topLevelComment
        const newBody = topLevelComment.body.replace(
          COMMENT_TAG,
          COMMENT_REPLY_TAG
        )
        await octokit.pulls.updateReviewComment({
          owner: repo.owner,
          repo: repo.repo,
          // eslint-disable-next-line camelcase
          comment_id: topLevelComment.id,
          body: newBody
        })
      }
    } catch (error) {
      warning(`Failed to update the top-level comment ${error}`)
    }
  }

  async getCommentsWithinRange(
    pullNumber: number,
    path: string,
    startLine: number,
    endLine: number
  ) {
    const comments = await this.listReviewComments(pullNumber)
    return comments.filter(
      (comment: any) =>
        comment.path === path &&
        comment.body !== '' &&
        ((comment.start_line !== undefined &&
          comment.start_line >= startLine &&
          comment.line <= endLine) ||
          (startLine === endLine && comment.line === endLine))
    )
  }

  async getCommentsAtRange(
    pullNumber: number,
    path: string,
    startLine: number,
    endLine: number
  ) {
    const comments = await this.listReviewComments(pullNumber)
    return comments.filter(
      (comment: any) =>
        comment.path === path &&
        comment.body !== '' &&
        ((comment.start_line !== undefined &&
          comment.start_line === startLine &&
          comment.line === endLine) ||
          (startLine === endLine && comment.line === endLine))
    )
  }

  async getCommentChainsWithinRange(
    pullNumber: number,
    path: string,
    startLine: number,
    endLine: number,
    tag = ''
  ) {
    const existingComments = await this.getCommentsWithinRange(
      pullNumber,
      path,
      startLine,
      endLine
    )
    // find all top most comments
    const topLevelComments = []
    for (const comment of existingComments) {
      if (!comment.in_reply_to_id) {
        topLevelComments.push(comment)
      }
    }

    let allChains = ''
    let chainNum = 0
    for (const topLevelComment of topLevelComments) {
      // get conversation chain
      const chain = await this.composeCommentChain(
        existingComments,
        topLevelComment
      )
      if (chain && chain.includes(tag)) {
        chainNum += 1
        allChains += `Conversation Chain ${chainNum}:
${chain}
---
`
      }
    }
    return allChains
  }

  async composeCommentChain(reviewComments: any[], topLevelComment: any) {
    const conversationChain = reviewComments
      .filter((cmt: any) => cmt.in_reply_to_id === topLevelComment.id)
      .map((cmt: any) => `${cmt.user.login}: ${cmt.body}`)

    conversationChain.unshift(
      `${topLevelComment.user.login}: ${topLevelComment.body}`
    )

    return conversationChain.join('\n---\n')
  }

  async getCommentChain(pullNumber: number, comment: any) {
    try {
      const reviewComments = await this.listReviewComments(pullNumber)
      const topLevelComment = await this.getTopLevelComment(
        reviewComments,
        comment
      )
      const chain = await this.composeCommentChain(
        reviewComments,
        topLevelComment
      )
      return {chain, topLevelComment}
    } catch (e) {
      warning(`Failed to get conversation chain: ${e}`)
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

  private reviewCommentsCache: Record<number, any[]> = {}

  async listReviewComments(target: number) {
    if (this.reviewCommentsCache[target]) {
      return this.reviewCommentsCache[target]
    }

    const allComments: any[] = []
    let page = 1
    try {
      for (;;) {
        const {data: comments} = await octokit.pulls.listReviewComments({
          owner: repo.owner,
          repo: repo.repo,
          // eslint-disable-next-line camelcase
          pull_number: target,
          page,
          // eslint-disable-next-line camelcase
          per_page: 100
        })
        allComments.push(...comments)
        page++
        if (!comments || comments.length < 100) {
          break
        }
      }

      this.reviewCommentsCache[target] = allComments
      return allComments
    } catch (e) {
      warning(`Failed to list review comments: ${e}`)
      return allComments
    }
  }

  async create(body: string, target: number) {
    try {
      // get comment ID from the response
      const response = await octokit.issues.createComment({
        owner: repo.owner,
        repo: repo.repo,
        // eslint-disable-next-line camelcase
        issue_number: target,
        body
      })
      // add comment to issueCommentsCache
      if (this.issueCommentsCache[target]) {
        this.issueCommentsCache[target].push(response.data)
      } else {
        this.issueCommentsCache[target] = [response.data]
      }
    } catch (e) {
      warning(`Failed to create comment: ${e}`)
    }
  }

  async replace(body: string, tag: string, target: number) {
    try {
      const cmt = await this.findCommentWithTag(tag, target)
      if (cmt) {
        await octokit.issues.updateComment({
          owner: repo.owner,
          repo: repo.repo,
          // eslint-disable-next-line camelcase
          comment_id: cmt.id,
          body
        })
      } else {
        await this.create(body, target)
      }
    } catch (e) {
      warning(`Failed to replace comment: ${e}`)
    }
  }

  async findCommentWithTag(tag: string, target: number) {
    try {
      const comments = await this.listComments(target)
      for (const cmt of comments) {
        if (cmt.body && cmt.body.includes(tag)) {
          return cmt
        }
      }

      return null
    } catch (e: unknown) {
      warning(`Failed to find comment with tag: ${e}`)
      return null
    }
  }

  private issueCommentsCache: Record<number, any[]> = {}

  async listComments(target: number) {
    if (this.issueCommentsCache[target]) {
      return this.issueCommentsCache[target]
    }

    const allComments: any[] = []
    let page = 1
    try {
      for (;;) {
        const {data: comments} = await octokit.issues.listComments({
          owner: repo.owner,
          repo: repo.repo,
          // eslint-disable-next-line camelcase
          issue_number: target,
          page,
          // eslint-disable-next-line camelcase
          per_page: 100
        })
        allComments.push(...comments)
        page++
        if (!comments || comments.length < 100) {
          break
        }
      }

      this.issueCommentsCache[target] = allComments
      return allComments
    } catch (e: any) {
      warning(`Failed to list comments: ${e}`)
      return allComments
    }
  }

  // function that takes a comment body and returns the list of commit ids that have been reviewed
  // commit ids are comments between the commit_ids_reviewed_start and commit_ids_reviewed_end markers
  // <!-- [commit_id] -->
  getReviewedCommitIds(commentBody: string): string[] {
    const start = commentBody.indexOf(COMMIT_ID_START_TAG)
    const end = commentBody.indexOf(COMMIT_ID_END_TAG)
    if (start === -1 || end === -1) {
      return []
    }
    const ids = commentBody.substring(start + COMMIT_ID_START_TAG.length, end)
    // remove the <!-- and --> markers from each id and extract the id and remove empty strings
    return ids
      .split('<!--')
      .map(id => id.replace('-->', '').trim())
      .filter(id => id !== '')
  }

  // get review commit ids comment block from the body as a string
  // including markers
  getReviewedCommitIdsBlock(commentBody: string): string {
    const start = commentBody.indexOf(COMMIT_ID_START_TAG)
    const end = commentBody.indexOf(COMMIT_ID_END_TAG)
    if (start === -1 || end === -1) {
      return ''
    }
    return commentBody.substring(start, end + COMMIT_ID_END_TAG.length)
  }

  // add a commit id to the list of reviewed commit ids
  // if the marker doesn't exist, add it
  addReviewedCommitId(commentBody: string, commitId: string): string {
    const start = commentBody.indexOf(COMMIT_ID_START_TAG)
    const end = commentBody.indexOf(COMMIT_ID_END_TAG)
    if (start === -1 || end === -1) {
      return `${commentBody}\n${COMMIT_ID_START_TAG}\n<!-- ${commitId} -->\n${COMMIT_ID_END_TAG}`
    }
    const ids = commentBody.substring(start + COMMIT_ID_START_TAG.length, end)
    return `${commentBody.substring(
      0,
      start + COMMIT_ID_START_TAG.length
    )}${ids}<!-- ${commitId} -->\n${commentBody.substring(end)}`
  }

  // given a list of commit ids provide the highest commit id that has been reviewed
  getHighestReviewedCommitId(
    commitIds: string[],
    reviewedCommitIds: string[]
  ): string {
    for (let i = commitIds.length - 1; i >= 0; i--) {
      if (reviewedCommitIds.includes(commitIds[i])) {
        return commitIds[i]
      }
    }
    return ''
  }

  async getAllCommitIds(): Promise<string[]> {
    const allCommits = []
    let page = 1
    let commits
    if (context && context.payload && context.payload.pull_request != null) {
      do {
        commits = await octokit.pulls.listCommits({
          owner: repo.owner,
          repo: repo.repo,
          // eslint-disable-next-line camelcase
          pull_number: context.payload.pull_request.number,
          // eslint-disable-next-line camelcase
          per_page: 100,
          page
        })

        allCommits.push(...commits.data.map(commit => commit.sha))
        page++
      } while (commits.data.length > 0)
    }

    return allCommits
  }

  // add in-progress status to the comment body
  addInProgressStatus(commentBody: string, statusMsg: string): string {
    const start = commentBody.indexOf(IN_PROGRESS_START_TAG)
    const end = commentBody.indexOf(IN_PROGRESS_END_TAG)
    // add to the beginning of the comment body if the marker doesn't exist
    // otherwise do nothing
    if (start === -1 || end === -1) {
      return `${IN_PROGRESS_START_TAG}

Currently reviewing new changes in this PR...

${statusMsg}

${IN_PROGRESS_END_TAG}

---

${commentBody}`
    }
    return commentBody
  }

  // remove in-progress status from the comment body
  removeInProgressStatus(commentBody: string): string {
    const start = commentBody.indexOf(IN_PROGRESS_START_TAG)
    const end = commentBody.indexOf(IN_PROGRESS_END_TAG)
    // remove the in-progress status if the marker exists
    // otherwise do nothing
    if (start !== -1 && end !== -1) {
      return (
        commentBody.substring(0, start) +
        commentBody.substring(end + IN_PROGRESS_END_TAG.length)
      )
    }
    return commentBody
  }
}
