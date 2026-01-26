import os
import sys

xwords_stripped = []
with open('lists/xwords.txt') as f:
	for line in f:
		line = line.rstrip()
		line_stats = line.split(';')
		if int(line_stats[1]) >= 50:
			xwords_stripped.append(line_stats[0])

with open('lists/xwords_stripped.txt', 'w') as f:
	for word in xwords_stripped:
		f.write(word + '\n');