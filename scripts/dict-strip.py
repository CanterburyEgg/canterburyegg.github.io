import os
import sys

words_stripped = []
with open('words.txt') as f:
	for line in f:
		line = line.lower().rstrip()
		if len([x for x in line if x not in 'aeiou']) == 3:
			words_stripped.append(line)

with open('words_stripped.txt', 'w') as f:
	for word in words_stripped:
		f.write(word + '\n');