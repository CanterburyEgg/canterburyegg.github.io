import os
import sys

consonants = ['b', 'c', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm', 'n', 'p', 'q', 'r', 's', 't', 'v', 'w', 'x', 'y', 'z']
words_stripped = []
cc_scored = []

with open('words_stripped.txt') as f:
	for line in f:
		words_stripped.append([''.join([x for x in line.rstrip() if x not in 'aeiou']), line.rstrip()])

for first in consonants:
	for second in consonants:
		for third in consonants:
			conso_combo = first + second + third
			matches = []
			score = 0

			for w in words_stripped:
				if conso_combo == w[0]:
					matches.append(w[1])
					score = score + len(w[1])
			
			if len(matches) >= 8:
				cc_scored.append([conso_combo, score, matches])

ccs_sorted = sorted(cc_scored, key=lambda x: x[1])

with open('levels.txt', 'w') as f:
	for arr in ccs_sorted:
		for item in arr:
			f.write('%s\t' % item)
		f.write('\n')