import os
import sys

if len(sys.argv) != 2:
	print('to run: python3 clean_list.py <list_file>')

else:
	# with open(sys.argv[1]) as f:
	# 	cards = [card.rstrip().split('\t') for card in f]
	with open(sys.argv[1], errors="ignore") as f:
		raw = f.read()
		cards_raw = raw.replace('\n','NEWLINE').replace('REPLACEME','\\n')
	cards_raw = cards_raw.rstrip('\\n')
	cards = cards_raw.split('\\n')

	for i in range(len(cards)):
		for j in range(i):
			print j