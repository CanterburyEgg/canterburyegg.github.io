import os
import sys

words_stripped = []
words_intersected = []
with open('lists/words.txt') as f:
	for line in f:
		line = line.lower().rstrip()
		if len([x for x in line if x not in 'aeiou']) == 3:
			words_stripped.append(line)

with open('lists/xwords_stripped.txt') as f:
	for line in f:
		line = line.rstrip()
		if line in words_stripped:
			words_intersected.append(line)

with open('lists/words_final.txt', 'w') as f:
	for word in words_intersected:
		f.write(word + '\n');