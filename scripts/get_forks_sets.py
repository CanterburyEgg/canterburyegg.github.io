import os
import json
import requests
from bs4 import BeautifulSoup

def get_a_tags(username, url):
	url = 'https://' + url
	response = requests.get(url + '/all-sets')
	soup = BeautifulSoup(response.content, 'html.parser')

	set_list = []
	for a_tag in soup.find_all('a'):
		if a_tag.get('class') and 'set-row' in a_tag.get('class'):
			a_dict = {}
			a_dict['href'] =  url + a_tag.get('href')
			a_dict['img_src'] = url + a_tag.find('img').get('src')
			a_dict['title'] = a_tag.find('div', class_='set-title').get_text(strip=True)
			a_dict['code'] = a_tag.find_all('div')[1].get_text(strip=True)
			a_dict['count'] = a_tag.find_all('div')[2].get_text(strip=True)

			set_list.append(a_dict)

	return set_list


if __name__ == '__main__':
	with open('lists/msehub-list.json', encoding='utf-8-sig') as f:
		js = json.load(f)

	all_sets = {}
	for fork in js['forks']:
		username = fork[:-10] # <USERNAME>[.github.io]
		all_sets[username] = get_a_tags(username, fork)

	with open('lists/msehub-include.txt', encoding='utf-8-sig') as f:
		includelist = f.readlines()

	for site in includelist:
		contents = site.split('\t')
		username = contents[0]
		url = contents[1]
		all_sets[username] = get_a_tags(username, url)

	with open('lists/msehub-all-sets.json', 'w', encoding='utf-8-sig') as f:
		json.dump(all_sets, f, indent=4)