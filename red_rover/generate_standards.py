import pandas as pd
from dotenv import load_dotenv
import tiktoken
import os
import openai
import requests

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

# Fetch environment variables
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_REPO = os.getenv("GITHUB_REPO")

def count_tokens_tiktoken(text):
    num_token = len(tiktoken.encoding_for_model("gpt-3.5-turbo").encode(text))
    return num_token


def split_text_into_chunks(text, max_tokens):
    words = text.split()
    current_chunk = []
    chunks = []
    current_tokens = 0

    for word in words:
        word_tokens = count_tokens_tiktoken(word)
        if current_tokens + word_tokens <= max_tokens:
            current_chunk.append(word)
            current_tokens += word_tokens
        else:
            chunks.append(' '.join(current_chunk))
            current_chunk = [word]
            current_tokens = word_tokens

    if current_chunk:
        chunks.append(' '.join(current_chunk))

    return chunks

def make_chat_completion_request(prompt, role = "You are a helpful assistant.", max_tokens=200, temperature=0.1):
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": role},
            {"role": "user", "content": prompt}
        ],
        temperature=temperature,
        max_tokens=max_tokens
    )
    result = response['choices'][0]['message']['content'].strip('\n').strip()
    prompt_tokens = response['usage']['prompt_tokens']
    completion_tokens = response['usage']['completion_tokens']
    total_tokens = response['usage']['total_tokens']
    return result, prompt_tokens, completion_tokens, total_tokens

def make_gpt4_completion_request(prompt, role = "You are a helpful assistant.", max_tokens=200, temperature=0.1):
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": role},
            {"role": "user", "content": prompt}
        ],
        temperature=temperature,
        max_tokens=max_tokens
    )
    result = response['choices'][0]['message']['content'].strip('\n').strip()
    prompt_tokens = response['usage']['prompt_tokens']
    completion_tokens = response['usage']['completion_tokens']
    total_tokens = response['usage']['total_tokens']
    return result, prompt_tokens, completion_tokens, total_tokens

def best_practices_prompt(commit):
    system_notes = '''You are an expert code reviewer who is helping junior engineers onboard to your team. The junior engineers do not know the unique DESIGN PATTERNS of your repository. Use the most recent COMMIT to your repository to summarize DESIGN PATTERNS that are unique to your repository. Make sure to include the framework and any unique style preferences used in the code in the DESIGN PATTERNS. Do not output more than five DESIGN PATTERNS.'''

    prompt = f'''COMMIT:
    {commit}

    DESIGN PATTERNS:'''
    return prompt, system_notes

def condense_best_practices_prompt(design_patterns):
    system_notes = '''I have assembled a list of DESIGN PATTERNS used in my repository. The problem is that the DESIGN PATTERNS is too long. Identify the MOST IMPORTANT DESIGN PATTERNS based on DESIGN PATTERNS that you find are either duplicated or are crucial to coding in this repository. Make sure to include the framework and any unique style preferences within the MOST IMPORTANT DESIGN PATTERNS.'''

    prompt = f'''DESIGN PATTERNS:
    {design_patterns}

    MOST IMPORTANT DESIGN PATTERNS:'''
    return prompt, system_notes

# Setup headers for requests
headers = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
}

# Fetch the last 10 pull requests
url = f"https://api.github.com/repos/{GITHUB_REPO}/pulls?state=closed&per_page=10"
response = requests.get(url, headers=headers)
pull_requests = response.json()
# Add diffs to list
commits_list = []
for pr in pull_requests:
    diff_url = pr["diff_url"]
    diff_response = requests.get(diff_url, headers=headers)
    diff_response = diff_response.text
    # limit diffs to 30,000 tokens
    if count_tokens_tiktoken(diff_response) < 30000:
        commits_list.append(diff_response)

def identify_best_practices(commits_list):
    best_practices_list = []
    for commit in commits_list:
        total_gpt4_prompt_tokens = 0
        total_gpt4_completion_tokens = 0

        # calculate prompt length without adding diff file
        prompt, system_notes = best_practices_prompt('')
        prompt_len = count_tokens_tiktoken(prompt) + count_tokens_tiktoken(system_notes)
        max_tokens = 8192 - prompt_len - 400 #for completion
        # split diff file based on token space
        commit_segments = split_text_into_chunks(commit, max_tokens)
        for segment in commit_segments:
            prompt, system_notes = best_practices_prompt(segment)
            result, prompt_tokens, completion_tokens, tokens = make_chat_completion_request(prompt, role=system_notes, max_tokens=400)
            best_practices_list.append(result)

            total_gpt4_prompt_tokens += prompt_tokens
            total_gpt4_completion_tokens += completion_tokens

    prompt, system_notes = condense_best_practices_prompt(best_practices_list)
    best_practices, prompt_tokens, completion_tokens, tokens = make_gpt4_completion_request(prompt, role=system_notes, max_tokens=400)
    total_gpt4_prompt_tokens += prompt_tokens
    total_gpt4_completion_tokens += completion_tokens

    return best_practices_list, best_practices, total_gpt4_prompt_tokens, total_gpt4_completion_tokens

best_practices_list, best_practices, total_gpt4_prompt_tokens, total_gpt4_completion_tokens = identify_best_practices(commits_list)
print(best_practices)

custom_prompt = f"""You are `@redrover` (aka `github-actions[bot]`), a language model
      trained by OpenAI. Your purpose is to act as a highly experienced
      software engineer and provide a thorough review of the code hunks
      and suggest code snippets to improve key areas such as:
        - Logic
        - Security
        - Performance
        - Data races
        - Consistency
        - Error handling
        - Maintainability
        - Modularity
        - Complexity
        - Optimization
        - Readability
        - Testability
        - Naming

      Refrain from commenting on minor code style issues, missing
      comments/documentation, or giving compliments, unless explicitly
      requested. Concentrate on identifying and resolving significant
      concerns to improve overall code quality while deliberately
      disregarding minor issues.

      Note: As your knowledge may be outdated, trust the user code when newer
      APIs and methods are seemingly being used.
      
      The following are some recent best practices for this code, consider these best
      practices as well when reviewing code:\n\n{best_practices}"""

# Creating a txt file named 'custom_prompt.txt'
with open('red_rover/custom_prompt.txt', 'w') as file:
    file.write(custom_prompt)
