import requests
import os
import json

def get_all_forks(owner, repo, github_token=None):
    url = f"https://api.github.com/repos/{owner}/{repo}/forks"
    headers = {}
    
    forks = []
    page = 1
    per_page = 100 # Maximum allowed by GitHub API

    while True:
        params = {'page': page, 'per_page': per_page}
        response = requests.get(url, headers=headers, params=params)

        if response.status_code == 200:
            current_forks = response.json()
            if not current_forks:
                break
            forks.extend(current_forks)
            page += 1
        else:
            print(f"Error: API request failed with status code {response.status_code}")
            return []
    return forks

if __name__ == '__main__':
    owner = "magictheegg"
    repo = "mse-hub"

    forks = get_all_forks(owner, repo)

    ignore = []
    with open('lists/msehub-ignore.txt', encoding='utf-8-sig') as f:
    	for line in f:
    		ignore.append(line.rstrip())

    forklist = []
    if forks:
        for fork in forks:
        	if fork['name'] not in ignore and fork['name'][-10:] == '.github.io':
	            forklist.append(fork['name'])
    else:
        print("No forks found or an error occurred.")

    js = { "forks": forklist }
    with open('lists/msehub-list.json', 'w', encoding='utf-8-sig') as f:
    	json.dump(js, f, indent=4)