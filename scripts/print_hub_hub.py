import os
import json

if __name__ == '__main__':
	with open('lists/msehub-all-sets.json', encoding='utf-8-sig') as f:
		js = json.load(f)

	for user in js:
		print(user)