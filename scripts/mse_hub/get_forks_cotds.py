import os
import json
import requests
import math
from datetime import datetime

def get_cotd_img(url, date):
	url = 'https://' + url

	try:
		response = requests.get(url + '/lists/all-cards.json')
		response.raise_for_status()
	except Exception as e:
		return ''

	json_data = json.loads(response.content.decode('utf-8-sig'))
	cards_raw = json_data['cards']
	cards = []

	for card in cards_raw:
		if not 'token' in card['shape'].lower() and not 'basic' in card['type'].lower():
			cards.append(card)

	cotd = cards[reallyRand(len(cards), date)]

	return url + '/sets/' + cotd['set'] + '-files/img/' + str(cotd['number']) + '_' + cotd['card_name'] + ('_front' if 'double' in cotd['shape'] else '') + '.' + ('png' if 'image_type' not in cotd else cotd['image_type'])

def reallyRand(x, date):	    # because JS dates are 0-11
	seed = date.year * 10000 + (date.month - 1) * 100 + date.day

	a = 1103515245
	c = 12345
	m = math.pow(2, 31)

	randomNumber = (a * seed + c) % m
	randomNumber = randomNumber / m

	return math.floor(randomNumber * x)

if __name__ == '__main__':
	d = datetime.now()

	with open('lists/msehub-list.json', encoding='utf-8-sig') as f:
		js = json.load(f)

	with open('lists/msehub-include.txt', encoding='utf-8-sig') as f:
		includelist = f.readlines()

	while True:
		for fork in js['forks']:
			print(get_cotd_img(fork, d))

		for site in includelist:
			print(get_cotd_img(site.split('\t')[1], d))

		break