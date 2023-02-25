import * as core from '@actions/core'
import * as github from '@actions/github'
import { Octokit } from '@octokit/action';

import { Bot } from './bot.js';


export const codeReview = async (bot: Bot, prompt: string, promptSuffix: string, octokit: Octokit) => {
    if (github.context.eventName != "pull_request" && github.context.eventName != "pull_request_target") {
        core.warning(`Skipped: current event is ${github.context.eventName}, only support pull_request event`);
        return;
    }

    // compute the diff
    const context = github.context;
    const repo = context.repo;

    if (!context.payload.pull_request) {
        core.warning(`Skipped: context.payload.pull_request is null`);
        return;
    }

    const line_number = (line: number | null | undefined) => {
        return (line === null || line === undefined) ? 0 : line;
    }
    let title = context.payload.pull_request.title;
    let description = "";
    if (context.payload.pull_request.body) {
        description = context.payload.pull_request.body;
    }
    const preprocessPrompt = (prompt: string, filename: string) => {
        return prompt.replaceAll('$filename', title)
                     .replaceAll('$description', description)
                     .replaceAll('$filename', filename);
    };

    // collect diff chunks
    const diff = await octokit.repos.compareCommits({
        owner: repo.owner,
        repo: repo.repo,
        base: context.payload.pull_request.base.sha,
        head: context.payload.pull_request.head.sha,
    });
    let { files, commits } = diff.data;
    if (!files) {
        core.warning(`Skipped: diff.data.files is null`);
        return;
    }

    // find existing comments
    let comments: Array<[string, number]> = [];
    for (let page = 0; /* true */; page += 1) {
        const results = await octokit.pulls.listReviewComments({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: context.payload.pull_request.number,
            page: page,
        });
        if (results.data.length === 0) {
            break;
        }
        comments = comments.concat(results.data.map((comment) => {
            core.info(`Found comment ${comment.path}:${comment.line}`);
            return [comment.path, line_number(comment.line)];
        }));
    }
    core.info(`Found ${comments.length} existing comments.`);

    // find patches to review
    let patches: Array<[string, number, string]> = [];
    for (let file of files) {
        const patch = file.patch;
        if (!patch) {
            continue;
        }
        let lines = patch.split('\n');
        let target_line = lines.length - 1;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].startsWith('+') || lines[i].startsWith('-')) {
                target_line = i;
                break;
            }
        }
        // skip existing comments
        if (comments.some((comment) => {
            return comment[0] === file.filename && comment[1] === target_line;
        })) {
            continue;
        }
        patches.push([file.filename, target_line, patch]);
    }

    for (let [filename, line, patch] of patches) {
        core.info(`Reviewing ${filename}:${line} with chatgpt ...`);
        let preprocessedPrompt = preprocessPrompt(prompt, filename);
        let message = annotate(preprocessedPrompt, promptSuffix, filename, patch);
        const comment = await bot.talk('review', message);
        if (comment.indexOf("LGTM!") != -1) {
            continue;
        }
        await octokit.pulls.createReviewComment({
            owner: repo.owner,
            repo: repo.repo,
            pull_number: context.payload.pull_request.number,
            commit_id: context.payload.pull_request.head.sha,
            path: filename,
            body: comment,
            line: line,
        });
    }
}

const annotate = (prompt: string, promptSuffix: string, filename: string, patch: string) => {
    return `${prompt}

\`\`\`diff
${patch}
\`\`\`

${promptSuffix}
`;
};
