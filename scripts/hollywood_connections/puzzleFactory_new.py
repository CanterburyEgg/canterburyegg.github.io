"""
Hollywood Connections puzzle generator.

Reads the actor/movie/TV universe built by buildUniverse.py and writes daily puzzles to
jsons/puzzle_batch.json.

Every puzzle has four groups of four actors:
  * slot 1: a "screen" group (a movie, a TV show, a franchise, or a role several actors played)
  * slot 2: an "other" group (names, awards, careers, life facts)
  * slots 3-4: wildcards (either kind; at most 3 screen groups per puzzle)
and exactly one group of each difficulty tier: yellow (easiest), green, blue, purple.

Board rules:
  * One answer only: no actor on the board fits a group they aren't in (every template knows all
    of its members, including borderline "extra" ones).
  * Restricted actors (anchored to one show, or must-includes with under 2 options) never appear
    in name groups, anchored ones only in their own show's group, and at most 1 per puzzle.
  * At most 2 low-option actors (exactly 2 possible groups) per puzzle.

Usage (from the repo root):
    python3 scripts/hollywood_connections/puzzleFactory_new.py

Already-published puzzles (every day before today) are kept exactly as they were; new puzzles
start today.
"""
import itertools
import json
import math
import random
import re
from collections import Counter, defaultdict
from datetime import date

import pandas as pd

TARGET = 730                           # new puzzles to generate
START_DATE = date(2026, 1, 1)          # must match START_DATE in hollywood-connections.html
OUTPUT = 'jsons/puzzle_batch.json'
MAX_SCREEN = 3

# ==========================================
# 1. DATA
# ==========================================
df = pd.read_csv('lists/hc_actors.csv').fillna('')
movies_df = pd.read_csv('lists/hc_movies.csv').fillna('')
shows_df = pd.read_csv('lists/hc_shows.csv').fillna('')
roles_df = pd.read_csv('lists/hc_roles.csv').fillna('')


def _split(v):
    return set(x.strip() for x in str(v).split('|') if x.strip())


ALL_NAMES = df['name'].tolist()
POOL = set(ALL_NAMES)
PROFILE = dict(zip(df['name'], df['profile_path']))
FIRST = dict(zip(df['name'], df['first_name']))
LAST = dict(zip(df['name'], df['last_name']))
INITIALS = dict(zip(df['name'], df['initials']))
MOVIE_SET = {n: _split(v) for n, v in zip(df['name'], df['movie_credits'])}
TV_SET = {n: _split(v) for n, v in zip(df['name'], df['tv_shows'])}
OPTIONS = dict(zip(df['name'], df['options']))
ANCHORED = {n: s for n, s in zip(df['name'], df['anchored_show']) if s}
RESTRICTED = set(ANCHORED) | {n for n, o in OPTIONS.items() if o < 2}
LOW_OPTION = {n for n, o in OPTIONS.items() if o == 2}
MOVIE_VOTES = dict(zip(movies_df['title'], movies_df['vote_count']))
ANIMATED = set(movies_df.loc[movies_df['animated'].astype(str) == 'True', 'title'])
SHOW_VOTES = dict(zip(shows_df['name'], shows_df['votes']))
ORDER = {(r.name, r.title): r.order for r in roles_df.itertuples()}
# Deep cuts: billed below 10th, or a voice role in a live-action movie (Bill Skarsgård voicing Kro in
# Eternals). They still count as members, so they never appear alongside the group, but they're never picked.
DEEP = {(r.name, r.title) for r in roles_df.itertuples()
        if r.kind == 'movie' and (r.order >= 10 or (str(r.voice) == 'True' and r.title not in ANIMATED))}

# ==========================================
# 2. HAND LISTS
# picks: clearly fit (used to build groups). extra: borderline (a player could argue they fit),
# so they count as members for the one-answer check and never appear on a board with the group.
# Lists only need to cover the actor pool. diff: base difficulty (0 = easiest, 1 = hardest).
# ==========================================
HAND = {
    # ---- awards
    "Best Actor Oscar Winners": dict(family="award", diff=0.45, picks=[
        "Adrien Brody", "Al Pacino", "Anthony Hopkins", "Ben Kingsley", "Brendan Fraser", "Casey Affleck",
        "Cillian Murphy", "Colin Firth", "Daniel Day-Lewis", "Denzel Washington", "Dustin Hoffman",
        "Eddie Redmayne", "F. Murray Abraham", "Forest Whitaker", "Gary Oldman", "Gene Hackman",
        "Geoffrey Rush", "Jack Nicholson", "Jamie Foxx", "Jeff Bridges", "Jeremy Irons", "Joaquin Phoenix",
        "Jon Voight", "Kevin Spacey", "Leonardo DiCaprio", "Marlon Brando", "Matthew McConaughey",
        "Michael Douglas", "Nicolas Cage", "Paul Newman", "Philip Seymour Hoffman", "Rami Malek",
        "Richard Dreyfuss", "Robert De Niro", "Robert Duvall", "Russell Crowe", "Sean Penn", "Tom Hanks",
        "Will Smith", "William Hurt"], extra=[]),
    "Best Actress Oscar Winners": dict(family="award", diff=0.45, picks=[
        "Brie Larson", "Cate Blanchett", "Charlize Theron", "Diane Keaton", "Ellen Burstyn", "Emma Stone",
        "Emma Thompson", "Frances McDormand", "Gwyneth Paltrow", "Halle Berry", "Helen Hunt", "Helen Mirren",
        "Hilary Swank", "Holly Hunter", "Jennifer Lawrence", "Jessica Chastain", "Jessica Lange",
        "Jodie Foster", "Julia Roberts", "Julianne Moore", "Julie Andrews", "Kate Winslet", "Kathy Bates",
        "Maggie Smith", "Marion Cotillard", "Meryl Streep", "Michelle Yeoh", "Natalie Portman",
        "Nicole Kidman", "Olivia Colman", "Reese Witherspoon", "Renée Zellweger", "Sally Field",
        "Sandra Bullock", "Susan Sarandon"], extra=[]),
    # Only winners since 2000 are picks (the ones people remember). Earlier winners still count as
    # members so they never appear alongside it; non-winners are fair game as red herrings.
    "People's Sexiest Man Alive": dict(family="award", diff=0.5, picks=[
        "Brad Pitt", "Pierce Brosnan", "Ben Affleck", "Johnny Depp", "Jude Law", "Matthew McConaughey",
        "George Clooney", "Matt Damon", "Hugh Jackman", "Ryan Reynolds", "Bradley Cooper", "Channing Tatum",
        "Chris Hemsworth", "Dwayne Johnson", "Idris Elba", "Michael B. Jordan", "Paul Rudd", "Chris Evans",
        "Patrick Dempsey", "John Krasinski"],
        extra=["Denzel Washington", "Harrison Ford", "Richard Gere", "Tom Cruise", "Mel Gibson", "Sean Connery",
               "Patrick Swayze", "Nick Nolte", "Mark Harmon"]),   # pre-2000 winners: they did win
    "Knighted or Made a Dame": dict(family="life", diff=0.55, picks=[
        "Anthony Hopkins", "Ian McKellen", "Patrick Stewart", "Michael Caine", "Ben Kingsley",
        "Daniel Day-Lewis", "Kenneth Branagh", "Judi Dench", "Maggie Smith", "Helen Mirren", "Emma Thompson",
        "Julie Andrews", "Mark Rylance", "Sean Connery", "Alec Guinness", "Christopher Lee", "Ian Holm",
        "Michael Gambon", "John Hurt", "Jonathan Pryce", "Gary Oldman", "Imelda Staunton"], extra=[]),
    # ---- careers
    "SNL Cast Members": dict(family="career", diff=0.5, picks=[
        "Adam Sandler", "Amy Poehler", "Andy Samberg", "Ben Stiller", "Bill Hader", "Bill Murray",
        "Billy Crystal", "Chris Rock", "Dan Aykroyd", "Eddie Murphy", "Jason Sudeikis", "Jenny Slate",
        "Joan Cusack", "Julia Louis-Dreyfus", "Kristen Wiig", "Maya Rudolph", "Mike Myers",
        "Robert Downey Jr.", "Rob Schneider", "Sarah Silverman", "Tina Fey", "Will Ferrell"],
        extra=[]),
    # ---- archetypes (vague by nature, so long borderline lists)
    "Action Heroes": dict(family="archetype", diff=0.3, picks=[
        "Arnold Schwarzenegger", "Sylvester Stallone", "Bruce Willis", "Tom Cruise", "Jason Statham",
        "Keanu Reeves", "Vin Diesel", "Dwayne Johnson", "Jackie Chan", "Linda Hamilton", "Sigourney Weaver",
        "Charlize Theron", "Michelle Rodriguez"],
        extra=["Liam Neeson", "Gerard Butler", "Mark Wahlberg", "Matt Damon", "Chris Hemsworth", "Chris Evans",
               "Jason Momoa", "Dave Bautista", "John Cena", "Wesley Snipes", "Dolph Lundgren", "Jet Li",
               "Donnie Yen", "Kurt Russell", "Mel Gibson", "Harrison Ford", "Denzel Washington",
               "Nicolas Cage", "Kate Beckinsale", "Gal Gadot", "Scarlett Johansson", "Angelina Jolie",
               "Uma Thurman", "Michelle Yeoh", "Tom Hardy", "Idris Elba", "Daniel Craig", "Pierce Brosnan",
               "Sean Connery", "Ving Rhames", "Carl Weathers", "Terry Crews", "Ryan Reynolds", "Hugh Jackman",
               "Henry Cavill", "Jeremy Renner", "Paul Walker", "Tyrese Gibson", "Alan Ritchson",
               "Frank Grillo", "Karl Urban", "Chris Pratt", "Michael Biehn", "Bob Odenkirk", "Milla Jovovich",
               "Jean Reno", "Jason Clarke", "Kiefer Sutherland", "Gina Carano"]),
    "Rom-Com Icons": dict(family="archetype", diff=0.4, picks=[
        "Julia Roberts", "Hugh Grant", "Meg Ryan", "Tom Hanks", "Jennifer Aniston", "Matthew McConaughey",
        "Sandra Bullock", "Reese Witherspoon", "Drew Barrymore", "Cameron Diaz", "Richard Gere",
        "Kate Hudson", "Jennifer Lopez"],
        extra=["Bradley Cooper", "Ryan Gosling", "Rachel McAdams", "Anne Hathaway", "Emma Stone",
               "Steve Carell", "Paul Rudd", "Adam Sandler", "Ashton Kutcher", "Ben Stiller", "Vince Vaughn",
               "Owen Wilson", "Colin Firth", "Renée Zellweger", "Amy Adams", "Mila Kunis", "Zooey Deschanel",
               "Isla Fisher", "Rebel Wilson", "Channing Tatum", "Zac Efron", "Jennifer Garner", "Gerard Butler",
               "Kristen Bell", "Emma Roberts", "Lily James", "Billy Crystal", "Diane Keaton", "Glen Powell",
               "Katherine Heigl", "Sydney Sweeney", "Amanda Seyfried", "Anna Faris", "Kevin James",
               "Leslie Mann", "Kate Winslet", "Rose Byrne", "Vanessa Hudgens", "Julia Stiles"]),
    "Scream Queens": dict(family="archetype", diff=0.5, picks=[
        "Jamie Lee Curtis", "Neve Campbell", "Courteney Cox", "Sarah Michelle Gellar", "Jenna Ortega",
        "Toni Collette", "Vera Farmiga", "Anya Taylor-Joy", "Lupita Nyong'o"],
        extra=["Winona Ryder", "Drew Barrymore", "Florence Pugh", "Jessica Biel", "Emily Blunt", "Elisabeth Moss",
               "Rose McGowan", "Sigourney Weaver", "Mckenna Grace", "Joey King", "Jessica Chastain",
               "Naomi Watts", "Sarah Paulson", "Kathy Bates", "Selma Blair", "Kate Beckinsale", "Heather Graham",
               "Linda Hamilton", "Milla Jovovich", "Taissa Farmiga", "Mia Goth", "Abigail Breslin"]),
    "Known by a Stage Name": dict(family="archetype", diff=0.85, picks=[
        "Whoopi Goldberg", "Vin Diesel", "Jamie Foxx", "Michael Caine", "Michael Keaton", "Nicolas Cage",
        "Emma Stone", "Natalie Portman", "Joaquin Phoenix", "Olivia Wilde", "Brie Larson", "Helen Mirren",
        "Julianne Moore", "Sigourney Weaver", "Charlie Sheen", "Ben Kingsley", "Tom Cruise", "Martin Sheen",
        "Alan Alda", "Diane Keaton", "Meg Ryan", "Winona Ryder", "Tim Allen", "Albert Brooks", "Ice Cube",
        "Ludacris", "Common", "Awkwafina"],
        extra=["Jet Li", "Jackie Chan", "Tina Fey", "Demi Moore", "Kirk Douglas"]),
    # ---- life facts
    "Child Stars": dict(family="life", diff=0.45, picks=[
        "Macaulay Culkin", "Haley Joel Osment", "Drew Barrymore", "Dakota Fanning", "Millie Bobby Brown",
        "Daniel Radcliffe", "Emma Watson", "Elijah Wood", "Jodie Foster", "Kirsten Dunst", "Natalie Portman",
        "Mckenna Grace", "Finn Wolfhard", "Jaden Smith", "Rupert Grint", "Freddie Highmore", "Lindsay Lohan",
        "Christina Ricci", "Anna Paquin"],
        extra=["Elle Fanning", "Scarlett Johansson", "Joaquin Phoenix", "Leonardo DiCaprio", "Christian Bale",
               "Jake Gyllenhaal", "Sean Astin", "Michael J. Fox", "Chloë Grace Moretz", "Hailee Steinfeld",
               "Saoirse Ronan", "Asa Butterfield", "Josh Hutcherson", "Joey King", "Iain Armitage",
               "Ty Simpkins", "Jack Dylan Grazer", "Kodi Smit-McPhee", "Zendaya", "Selena Gomez",
               "Neil Patrick Harris", "Tom Holland", "Emma Roberts", "Jamie Bell", "Tye Sheridan",
               "Nick Robinson", "Abigail Breslin", "Ryan Gosling", "Justin Timberlake", "Kristen Stewart",
               "Mila Kunis", "Miranda Cosgrove", "Vanessa Hudgens", "Zac Efron", "Jennifer Love Hewitt",
               "Sarah Michelle Gellar", "Keri Russell", "Michelle Williams", "Topher Grace", "Mara Wilson",
               "Jacob Tremblay", "Dafne Keen", "Noah Schnapp", "Gaten Matarazzo", "Caleb McLaughlin",
               "Sadie Sink", "Brooke Shields", "Tatum O'Neal", "Kurt Russell", "Ron Howard", "Wil Wheaton",
               "Corey Feldman", "River Phoenix", "Thora Birch", "Alyson Hannigan", "Melissa Joan Hart"]),

    # ---- added Nov 27: shared roles and character types
    "Played Catwoman": dict(family="role", diff=0.2, picks=[
        "Michelle Pfeiffer", "Anne Hathaway", "Zoë Kravitz", "Halle Berry"], extra=[]),
    "Played Lex Luthor": dict(family="role", diff=0.8, picks=[
        "Gene Hackman", "Kevin Spacey", "Jesse Eisenberg", "Nicholas Hoult"], extra=[]),
    "Played Dr. Watson": dict(family="role", diff=0.55, picks=[
        "Jude Law", "Martin Freeman", "Lucy Liu", "John C. Reilly"], extra=[]),
    "Played a Batman Villain": dict(family="role", diff=0.38, picks=['Heath Ledger', 'Jack Nicholson', 'Joaquin Phoenix', 'Jared Leto', 'Tom Hardy', 'Cillian Murphy', 'Danny DeVito', 'Colin Farrell', 'Jim Carrey', 'Paul Dano', 'Tommy Lee Jones', 'Aaron Eckhart', 'Arnold Schwarzenegger', 'Uma Thurman', 'Liam Neeson', 'Margot Robbie'],
        extra=['Marion Cotillard', 'Michelle Pfeiffer', 'Anne Hathaway', 'Zoë Kravitz', 'Halle Berry', 'Mark Hamill', 'Zach Galifianakis', 'Jenny Slate']),
    "Played a Bond Villain": dict(family="role", diff=0.55, picks=['Javier Bardem', 'Christoph Waltz', 'Mads Mikkelsen', 'Rami Malek', 'Sean Bean', 'Christopher Walken', 'Christopher Lee', 'Jonathan Pryce', 'Famke Janssen'],
        extra=['Dave Bautista', 'Benicio del Toro', 'Rosamund Pike']),
    "Bond Girls": dict(family="role", diff=0.38, picks=[
        "Halle Berry", "Eva Green", "Léa Seydoux", "Ana de Armas", "Rosamund Pike", "Michelle Yeoh",
        "Olga Kurylenko", "Gemma Arterton", "Monica Bellucci", "Kim Basinger"],
        extra=["Famke Janssen", "Naomie Harris"]),
    "Played Jesus": dict(family="role", diff=0.8, picks=[
        "Willem Dafoe", "Jim Caviezel", "Ewan McGregor", "Max von Sydow"], extra=["Christian Bale"]),
    "Played the Devil": dict(family="role", diff=0.8, picks=['Al Pacino', 'Robert De Niro', 'Harvey Keitel', 'Jack Nicholson', 'Peter Stormare'],
        extra=['Viggo Mortensen', 'Tim Curry']),
    "Played the President": dict(family="role", diff=0.55, picks=['Harrison Ford', 'Morgan Freeman', 'Bill Pullman', 'Michael Douglas', 'Jamie Foxx', 'Kevin Kline', 'Jack Nicholson', 'Terry Crews', 'Daniel Day-Lewis', 'Josh Brolin', 'Anthony Hopkins', 'Aaron Eckhart', 'Martin Sheen', 'Kevin Spacey', 'Julia Louis-Dreyfus', 'Robin Williams'],
        extra=['Woody Harrelson', 'Jeff Bridges', 'Bill Murray', 'James Marsden', 'Liev Schreiber', 'John Cusack', 'Greg Kinnear', 'Brendan Gleeson', 'Tony Goldwyn', 'Geena Davis', 'James Cromwell', 'Danny Glover', 'Gene Hackman', 'Bryan Cranston', 'Glenn Close', 'Sebastian Stan']),
    "Played a Boxer": dict(family="role", diff=0.5, picks=['Sylvester Stallone', 'Robert De Niro', 'Hilary Swank', 'Mark Wahlberg', 'Christian Bale', 'Will Smith', 'Russell Crowe', 'Michael B. Jordan', 'Jake Gyllenhaal', 'Denzel Washington', 'Brad Pitt', 'Carl Weathers', 'Dolph Lundgren'],
        extra=['Daniel Day-Lewis', 'Wesley Snipes', 'Morgan Freeman', 'Hugh Jackman', 'Tom Hardy', 'Joel Edgerton']),
    "Played a Sports Coach": dict(family="role", diff=0.55, picks=['Denzel Washington', 'Al Pacino', 'Gene Hackman', 'Jason Sudeikis', 'Kyle Chandler', 'Samuel L. Jackson', 'Kurt Russell', 'Will Ferrell', 'Philip Seymour Hoffman'],
        extra=['Kevin Costner', 'Matthew McConaughey', 'Ben Affleck', 'Ed Harris', 'Woody Harrelson', 'Keanu Reeves', 'Morgan Freeman', 'Clint Eastwood', 'Brad Pitt', 'Adam Sandler']),
    "Played a Real Musician": dict(family="role", diff=0.5, picks=['Rami Malek', 'Taron Egerton', 'Joaquin Phoenix', 'Reese Witherspoon', 'Jamie Foxx', 'Chadwick Boseman', 'Marion Cotillard', 'Renée Zellweger', 'Val Kilmer', 'Timothée Chalamet', 'Bradley Cooper', 'Jennifer Lopez', 'Angela Bassett', 'Viola Davis', 'Edward Norton'],
        extra=['Gary Oldman', 'Don Cheadle', 'Ethan Hawke', 'Paul Dano', 'John Cusack', 'Kristen Stewart', 'Dakota Fanning', 'Tom Hiddleston', 'Kurt Russell', 'Cate Blanchett', 'Heath Ledger', 'Christian Bale', 'Richard Gere', 'Ben Whishaw', 'Michael Shannon', 'Jonathan Rhys Meyers', 'Kevin Spacey', 'Forest Whitaker', 'Jessica Chastain', 'Anthony Mackie', 'Jamie Bell']),
    "Played an Astronaut": dict(family="role", diff=0.38, picks=['Tom Hanks', 'Kevin Bacon', 'Bill Paxton', 'Gary Sinise', 'Ryan Gosling', 'Matt Damon', 'Jessica Chastain', 'Sandra Bullock', 'George Clooney', 'Matthew McConaughey', 'Anne Hathaway', 'Bruce Willis', 'Ben Affleck'],
        extra=['Brad Pitt', 'Natalie Portman', 'Ed Harris', 'Dennis Quaid', 'Jake Gyllenhaal', 'Ryan Reynolds', 'Rebecca Ferguson', 'Cillian Murphy', 'Chris Evans', 'Kate Mara', 'Michael Peña', 'Sebastian Stan', 'Wes Bentley', 'Owen Wilson', 'Steve Buscemi', 'Michael Clarke Duncan', 'Will Patton', 'Felicity Jones', 'Kyle Chandler', 'Jon Hamm', 'Hiroyuki Sanada', 'Rose Byrne', 'Michelle Yeoh', 'Benedict Wong', 'Jason Clarke', 'Tim Robbins', 'Don Cheadle', 'Connie Nielsen']),
    "Famously Played a 'John'": dict(family="role", diff=0.8, picks=[
        "Keanu Reeves", "Bruce Willis", "Sylvester Stallone", "Arnold Schwarzenegger", "Kit Harington",
        "Kevin Costner", "Russell Crowe", "Robin Williams", "Michael Clarke Duncan", "Taylor Kitsch",
        "Samuel L. Jackson"],
        extra=["Christian Bale", "Jason Clarke", "Tom Hardy", "Jude Law", "Martin Freeman"]),
    "Famously Played a 'Jack'": dict(family="role", diff=0.8, picks=[
        "Johnny Depp", "Leonardo DiCaprio", "Jack Nicholson", "Tom Cruise", "John Krasinski", "Jake Gyllenhaal",
        "Kurt Russell"],
        extra=["Harrison Ford", "Alec Baldwin", "Ben Affleck", "Chris Pine", "Keanu Reeves", "Michael Douglas",
               "George Clooney", "Robert De Niro", "Michael Caine", "Sylvester Stallone"]),
    "Played a TV Doctor": dict(family="role", diff=0.38, picks=[
        "Hugh Laurie", "Ellen Pompeo", "Patrick Dempsey", "Sandra Oh", "George Clooney", "Freddie Highmore",
        "Neil Patrick Harris", "Alan Alda", "Omar Epps", "Lisa Edelstein", "Jesse Spencer", "Justin Chambers",
        "Chandra Wilson", "Robert Sean Leonard", "Jennifer Morrison", "Olivia Wilde"], extra=[]),
    # ---- added Nov 27: careers and life facts
    "Former Disney Channel Stars": dict(family="career", diff=0.38, picks=['Zendaya', 'Selena Gomez', 'Vanessa Hudgens', 'Zac Efron', 'Shia LaBeouf', 'Ryan Gosling', 'Justin Timberlake', 'Jenna Ortega'],
        extra=['Keri Russell', 'Lindsay Lohan']),
    "Started in Stand-Up": dict(family="career", diff=0.38, picks=[
        "Kevin Hart", "Chris Rock", "Steve Martin", "Eddie Murphy", "Jim Carrey", "Robin Williams",
        "Billy Crystal", "Sarah Silverman", "Adam Sandler", "Ray Romano", "Tim Allen", "Martin Lawrence",
        "Zach Galifianakis", "Whoopi Goldberg", "Jamie Foxx", "Kevin James", "Denis Leary", "T.J. Miller",
        "Rob Schneider", "Craig Robinson", "Marlon Wayans", "David Cross", "Jenny Slate", "Ken Jeong",
        "Patton Oswalt", "Kumail Nanjiani"],
        extra=["Seth Rogen", "Michael Keaton", "Bob Odenkirk", "Awkwafina"]),
    "Hosted the Oscars": dict(family="career", diff=0.55, picks=['Billy Crystal', 'Steve Martin', 'Whoopi Goldberg', 'Chris Rock', 'Hugh Jackman', 'Anne Hathaway', 'James Franco', 'Neil Patrick Harris', 'Alec Baldwin', 'Regina Hall'],
        extra=['Alan Alda', 'Robin Williams', 'Michael Caine', 'Ellen Burstyn']),
    "Has a Famous Acting Sibling": dict(family="life", diff=0.55, picks=['Owen Wilson', 'Luke Wilson', 'Chris Hemsworth', 'Liam Hemsworth', 'Jake Gyllenhaal', 'Maggie Gyllenhaal', 'Casey Affleck', 'Ben Affleck', 'Dave Franco', 'James Franco', 'Bill Skarsgård', 'Alexander Skarsgård', 'Elle Fanning', 'Dakota Fanning', 'Rooney Mara', 'Kate Mara', 'Elizabeth Olsen', 'Joaquin Phoenix', 'Alec Baldwin', 'Zooey Deschanel', 'Charlie Sheen', 'Macaulay Culkin', 'John Cusack', 'Joan Cusack', 'Jeff Bridges', 'Marlon Wayans'],
        extra=['Julia Roberts', 'Kate Hudson', 'Anjelica Huston', 'Danny Huston', 'Jason Bateman', 'Haley Joel Osment', 'Jason Schwartzman', 'Dan Aykroyd', 'Jamie Lee Curtis', 'Michael Douglas', 'Martin Sheen', 'Ben Stiller']),
    # ---- iconic character names (picks: actor -> the role that makes them fit)
    "Famously Played a 'Rick'": dict(family="role", diff=0.8, picks=['Andrew Lincoln', 'Harrison Ford', 'Leonardo DiCaprio', 'Brendan Fraser'],
        roles={'Andrew Lincoln': 'Rick Grimes', 'Harrison Ford': 'Rick Deckard', 'Leonardo DiCaprio': 'Rick Dalton', 'Brendan Fraser': "Rick O'Connell"},
        extra=[]),
    "Famously Played a 'Peter'": dict(family="role", diff=0.8, picks=['Tobey Maguire', 'Andrew Garfield', 'Tom Holland', 'Chris Pratt', 'Bill Murray', 'Robin Williams'],
        roles={'Tobey Maguire': 'Peter Parker', 'Andrew Garfield': 'Peter Parker', 'Tom Holland': 'Peter Parker', 'Chris Pratt': 'Peter Quill', 'Bill Murray': 'Peter Venkman', 'Robin Williams': 'Peter Pan in Hook'},
        extra=['John Heard', 'Miles Teller']),
    "Famously Played a 'Bruce'": dict(family="role", diff=0.8, picks=['Christian Bale', 'Ben Affleck', 'Robert Pattinson', 'Michael Keaton', 'George Clooney', 'Val Kilmer', 'Mark Ruffalo', 'Edward Norton', 'Eric Bana', 'Jim Carrey'],
        roles={'Christian Bale': 'Bruce Wayne', 'Ben Affleck': 'Bruce Wayne', 'Robert Pattinson': 'Bruce Wayne', 'Michael Keaton': 'Bruce Wayne', 'George Clooney': 'Bruce Wayne', 'Val Kilmer': 'Bruce Wayne', 'Mark Ruffalo': 'Bruce Banner', 'Edward Norton': 'Bruce Banner', 'Eric Bana': 'Bruce Banner', 'Jim Carrey': 'Bruce Almighty'},
        extra=[]),
    "Famously Played a 'Max'": dict(family="role", diff=0.8, picks=['Mel Gibson', 'Tom Hardy', 'Mark Wahlberg', 'Jason Schwartzman'],
        roles={'Mel Gibson': 'Mad Max', 'Tom Hardy': 'Mad Max', 'Mark Wahlberg': 'Max Payne', 'Jason Schwartzman': 'Max Fischer in Rushmore'},
        extra=[]),
    "Famously Played a 'Hannibal'": dict(family="role", diff=0.8, picks=['Anthony Hopkins', 'Mads Mikkelsen', 'Brian Cox', 'Liam Neeson'],
        roles={'Anthony Hopkins': 'Hannibal Lecter', 'Mads Mikkelsen': 'Hannibal Lecter', 'Brian Cox': 'Hannibal Lecktor in Manhunter', 'Liam Neeson': 'Hannibal Smith in The A-Team'},
        extra=[]),
    "Famously Played a 'Mia'": dict(family="role", diff=0.8, picks=['Uma Thurman', 'Anne Hathaway', 'Emma Stone', 'Jordana Brewster'],
        roles={'Uma Thurman': 'Mia Wallace', 'Anne Hathaway': 'Mia Thermopolis', 'Emma Stone': 'Mia in La La Land', 'Jordana Brewster': 'Mia Toretto'},
        extra=[]),
    "Famously Played an 'Annie'": dict(family="role", diff=0.8, picks=['Diane Keaton', 'Kathy Bates', 'Sandra Bullock', 'Kristen Wiig', 'Toni Collette'],
        roles={'Diane Keaton': 'Annie Hall', 'Kathy Bates': 'Annie Wilkes', 'Sandra Bullock': 'Annie in Speed', 'Kristen Wiig': 'Annie in Bridesmaids', 'Toni Collette': 'Annie Graham in Hereditary'},
        extra=['Rachel McAdams']),
    "Famously Played a 'Frank'": dict(family="role", diff=0.8, picks=['Leonardo DiCaprio', 'Kevin Spacey', 'Jon Bernthal', 'Jason Statham', 'Jack Nicholson', 'Al Pacino', 'Robert De Niro', 'Denzel Washington'],
        roles={'Leonardo DiCaprio': 'Frank Abagnale', 'Kevin Spacey': 'Frank Underwood', 'Jon Bernthal': 'Frank Castle', 'Jason Statham': 'Frank Martin in The Transporter', 'Jack Nicholson': 'Frank Costello', 'Al Pacino': 'Frank Slade', 'Robert De Niro': 'Frank Sheeran', 'Denzel Washington': 'Frank Lucas'},
        extra=['Bill Murray']),
    "Famously Played a 'Danny'": dict(family="role", diff=0.8, picks=['George Clooney', 'John Travolta', 'Leonardo DiCaprio', 'Ewan McGregor'],
        roles={'George Clooney': 'Danny Ocean', 'John Travolta': 'Danny Zuko', 'Leonardo DiCaprio': 'Danny Archer', 'Ewan McGregor': 'Danny Torrance in Doctor Sleep'},
        extra=['Colin Farrell']),
    "Famously Played a 'Marty'": dict(family="role", diff=0.8, picks=['Michael J. Fox', 'Woody Harrelson', 'Jason Bateman', 'Don Cheadle'],
        roles={'Michael J. Fox': 'Marty McFly', 'Woody Harrelson': 'Marty Hart', 'Jason Bateman': 'Marty Byrde', 'Don Cheadle': 'Marty Kaan'},
        extra=[]),
    "Famously Played a 'Tony'": dict(family="role", diff=0.8, picks=['Robert Downey Jr.', 'Al Pacino', 'John Travolta', 'Viggo Mortensen'],
        roles={'Robert Downey Jr.': 'Tony Stark', 'Al Pacino': 'Tony Montana', 'John Travolta': 'Tony Manero', 'Viggo Mortensen': 'Tony Lip in Green Book'},
        extra=[]),
    "Famously Played a 'Nick'": dict(family="role", diff=0.8, picks=['Samuel L. Jackson', 'Tobey Maguire', 'Ben Affleck', 'Jake Johnson', 'Michael Douglas'],
        roles={'Samuel L. Jackson': 'Nick Fury', 'Tobey Maguire': 'Nick Carraway', 'Ben Affleck': 'Nick Dunne', 'Jake Johnson': 'Nick Miller in New Girl', 'Michael Douglas': 'Nick Curran'},
        extra=['Jason Bateman']),
    "Famously Played a 'Rachel'": dict(family="role", diff=0.8, picks=['Jennifer Aniston', 'Maggie Gyllenhaal', 'Katie Holmes', 'Naomi Watts', 'Emily Blunt'],
        roles={'Jennifer Aniston': 'Rachel Green', 'Maggie Gyllenhaal': 'Rachel Dawes', 'Katie Holmes': 'Rachel Dawes', 'Naomi Watts': 'Rachel in The Ring', 'Emily Blunt': 'Rachel in The Girl on the Train'},
        extra=['Rachel Weisz']),
    "Famously Played a 'Sarah'": dict(family="role", diff=0.8, picks=['Linda Hamilton', 'Emilia Clarke', 'Lena Headey', 'Jennifer Connelly'],
        roles={'Linda Hamilton': 'Sarah Connor', 'Emilia Clarke': 'Sarah Connor', 'Lena Headey': 'Sarah Connor', 'Jennifer Connelly': 'Sarah in Labyrinth'},
        extra=['Rebecca Hall', 'Laura Linney']),
    "Famously Played an 'Elizabeth'": dict(family="role", diff=0.8, picks=['Keira Knightley', 'Cate Blanchett', 'Helen Mirren', 'Olivia Colman', 'Imelda Staunton'],
        roles={'Keira Knightley': 'Elizabeth Swann and Elizabeth Bennet', 'Cate Blanchett': 'Queen Elizabeth I', 'Helen Mirren': 'Queen Elizabeth II', 'Olivia Colman': 'Queen Elizabeth II', 'Imelda Staunton': 'Queen Elizabeth II'},
        extra=[]),
    "Famously Played a 'Harry'": dict(family="role", diff=0.8, picks=['Daniel Radcliffe', 'Joe Pesci', 'Billy Crystal', 'Bruce Willis', 'Colin Firth', 'James Franco', 'Arnold Schwarzenegger'],
        roles={'Daniel Radcliffe': 'Harry Potter', 'Joe Pesci': 'Harry in Home Alone', 'Billy Crystal': 'Harry Burns', 'Bruce Willis': 'Harry Stamper', 'Colin Firth': 'Harry Hart', 'James Franco': 'Harry Osborn', 'Arnold Schwarzenegger': 'Harry Tasker in True Lies'},
        extra=['Jeff Daniels', 'Alan Rickman']),
    "Famously Played a 'Michael'": dict(family="role", diff=0.8, picks=['Al Pacino', 'Steve Carell', 'Jason Bateman', 'George Clooney', 'Dustin Hoffman'],
        roles={'Al Pacino': 'Michael Corleone', 'Steve Carell': 'Michael Scott', 'Jason Bateman': 'Michael Bluth', 'George Clooney': 'Michael Clayton', 'Dustin Hoffman': 'Michael Dorsey in Tootsie'},
        extra=[]),
    "Famously Played a 'Walter'": dict(family="role", diff=0.8, picks=['Bryan Cranston', 'John Goodman', 'Ben Stiller', 'Clint Eastwood'],
        roles={'Bryan Cranston': 'Walter White', 'John Goodman': 'Walter Sobchak', 'Ben Stiller': 'Walter Mitty', 'Clint Eastwood': 'Walt Kowalski in Gran Torino'},
        extra=[]),
    "Famously Played a 'Luke'": dict(family="role", diff=0.8, picks=['Mark Hamill', 'Paul Newman', 'Dwayne Johnson', 'Ryan Gosling'],
        roles={'Mark Hamill': 'Luke Skywalker', 'Paul Newman': 'Cool Hand Luke', 'Dwayne Johnson': 'Luke Hobbs', 'Ryan Gosling': 'Luke Glanton'},
        extra=[]),
    "Famously Played a 'Sam'": dict(family="role", diff=0.8, picks=['Sean Astin', 'Anthony Mackie', 'Shia LaBeouf', 'Garrett Hedlund', 'Tom Hanks'],
        roles={'Sean Astin': 'Samwise Gamgee', 'Anthony Mackie': 'Sam Wilson', 'Shia LaBeouf': 'Sam Witwicky', 'Garrett Hedlund': 'Sam Flynn', 'Tom Hanks': 'Sam Baldwin in Sleepless in Seattle'},
        extra=['Sam Rockwell']),
    "Famously Played a 'Ray'": dict(family="role", diff=0.8, picks=['Kevin Costner', 'Dustin Hoffman', 'Dan Aykroyd', 'Jamie Foxx'],
        roles={'Kevin Costner': 'Ray Kinsella', 'Dustin Hoffman': 'Ray Babbitt', 'Dan Aykroyd': 'Ray Stantz', 'Jamie Foxx': 'Ray Charles'},
        extra=[]),
    "Famously Played a 'Jake'": dict(family="role", diff=0.8, picks=['Sam Worthington', 'Jack Nicholson', 'Robert De Niro', 'Ethan Hawke', 'Andy Samberg'],
        roles={'Sam Worthington': 'Jake Sully', 'Jack Nicholson': 'Jake Gittes', 'Robert De Niro': 'Jake LaMotta', 'Ethan Hawke': 'Jake Hoyt', 'Andy Samberg': 'Jake Peralta'},
        extra=[]),
    "Famously Played a 'Doc'": dict(family="role", diff=0.8, picks=['Christopher Lloyd', 'Val Kilmer', 'Paul Newman', 'Alfred Molina'],
        roles={'Christopher Lloyd': 'Doc Brown', 'Val Kilmer': 'Doc Holliday', 'Paul Newman': 'Doc Hudson in Cars', 'Alfred Molina': 'Doc Ock'},
        extra=[]),
    "Played Sherlock Holmes": dict(family="role", diff=0.3, picks=[
        "Robert Downey Jr.", "Benedict Cumberbatch", "Henry Cavill", "Ian McKellen", "Will Ferrell"], extra=[]),
    "Played the Joker": dict(family="role", diff=0.25, picks=[
        "Heath Ledger", "Joaquin Phoenix", "Jack Nicholson", "Jared Leto"], extra=["Mark Hamill"]),
    "Played Batman": dict(family="role", diff=0.2, picks=[
        "Christian Bale", "Robert Pattinson", "Ben Affleck", "Michael Keaton", "George Clooney", "Val Kilmer"],
        extra=["Will Arnett"]),   # voiced Batman in The Lego Movie
    "Played Elvis Presley": dict(family="role", diff=0.6, picks=[
        "Austin Butler", "Jacob Elordi", "Kurt Russell", "Jonathan Rhys Meyers", "Michael Shannon"], extra=[]),
    "Played James Bond": dict(family="role", diff=0.15, picks=[
        "Daniel Craig", "Pierce Brosnan", "Sean Connery", "Timothy Dalton", "Roger Moore"], extra=[]),
    "Played the Hulk": dict(family="role", diff=0.3, picks=["Mark Ruffalo", "Edward Norton", "Eric Bana"], extra=[]),
    "Played Robin Hood": dict(family="role", diff=0.55, picks=[
        "Taron Egerton", "Russell Crowe", "Kevin Costner", "Cary Elwes", "Sean Connery"], extra=[]),
    "Played Jack Ryan": dict(family="role", diff=0.6, picks=[
        "John Krasinski", "Chris Pine", "Ben Affleck", "Harrison Ford", "Alec Baldwin"], extra=[]),
    "Played Spider-Man": dict(family="role", diff=0.15, picks=[
        "Tobey Maguire", "Andrew Garfield", "Tom Holland", "Jake Johnson"], extra=[]),
    "Played Superman": dict(family="role", diff=0.3, picks=[
        "Henry Cavill", "Christopher Reeve", "Brandon Routh", "Nicolas Cage", "David Corenswet"], extra=[]),
}

# ---- name wordplay (solvable by reading the board). Borderline members are computed from keywords.
NAME_LISTS = {
    "Last Name Is a Job": dict(diff=0.65, picks=[
        "Gerard Butler", "Austin Butler", "Isla Fisher", "Simon Baker", "Minnie Driver", "Holly Hunter",
        "Sigourney Weaver", "Will Smith", "Maggie Smith", "Jaden Smith"],
        keywords=["butler", "fisher", "baker", "driver", "hunter", "weaver", "smith", "cooper", "turner",
                  "chandler", "taylor", "cook", "miller", "carpenter", "mason", "archer", "porter", "gardner",
                  "potter", "thatcher", "fletcher", "sawyer", "wright", "glover", "dance", "page", "marsh",
                  "shepherd", "palmer", "parker", "walker", "barber", "farmer", "tanner", "brewer", "stewart"]),
    "Animal in the Last Name": dict(diff=0.7, picks=[
        "Megan Fox", "Michael J. Fox", "Ryan Gosling", "Rosamund Pike", "Finn Wolfhard"],
        keywords=["fox", "wolf", "gosling", "pike", "crow", "hawk", "hart", "bull", "lamb", "bear", "swan",
                  "drake", "finch", "wren", "colt", "buck", "bird", "bacon", "bean", "cage", "phoenix", "lion",
                  "seal", "mule", "eagle", "raven", "steer", "hogg", "katz", "fish"]),
    "Nature in the Last Name": dict(diff=0.65, picks=[
        "Elijah Wood", "Jonah Hill", "Sally Field", "Elizabeth Banks", "Emma Stone", "Chris Pine",
        "Carrie-Anne Moss", "Orlando Bloom"],
        keywords=["wood", "hill", "field", "bank", "stone", "pine", "moss", "bloom", "rose", "green", "lane",
                  "rock", "brook", "lake", "river", "forest", "marsh", "dale", "glen", "frost", "snow", "rain",
                  "storm", "leaf", "ford", "berg", "wright", "strong", "flower", "branch", "bush", "reed"]),
    "Food in the Name": dict(diff=0.75, picks=["Kevin Bacon", "Sean Bean", "Jon Hamm", "Brie Larson"],
        keywords=["bacon", "bean", "ham", "brie", "curry", "cooke", "cube", "olive", "rice", "pepper", "salt",
                  "berry", "candy", "cake", "pie", "pickle", "apple", "nut", "cherry", "honey", "sugar", "lemon",
                  "carrey", "kale", "corn", "bun", "gin", "rye", "mint", "jam", "basil", "butter"]),
    "Place Name in the Name": dict(diff=0.8, tokens=True, picks=[
        "Tom Holland", "Denzel Washington", "Kerry Washington", "Florence Pugh", "Dakota Fanning",
        "Dakota Johnson", "Joaquin Phoenix", "Andrew Lincoln", "Michael B. Jordan", "Orlando Bloom",
        "Bryce Dallas Howard"],
        keywords=["holland", "washington", "florence", "dakota", "phoenix", "lincoln", "jordan", "orlando",
                  "dallas", "austin", "paris", "sydney", "chelsea", "brooklyn", "savannah", "georgia", "houston",
                  "cleveland", "jackson", "madison", "denver", "london", "victoria", "india", "kerry", "hudson",
                  "troy", "camden", "charlotte", "aspen", "berkeley", "nevada", "montana", "carolina", "york",
                  "kent", "devon", "cornwall", "wales", "cuba", "chad", "jersey", "boston", "phoenix"]),
    "Car Brand in the Name": dict(diff=0.85, tokens=True, picks=[
        "Harrison Ford", "Andrew Lincoln", "Morgan Freeman", "Wes Bentley"],
        keywords=["ford", "lincoln", "morgan", "bentley", "austin", "mercedes", "chevy", "dodge", "jaguar",
                  "ferrari", "porsche", "tesla", "lexus", "audi", "fiat", "volvo", "saab", "lotus", "mazda",
                  "honda", "nissan", "jeep", "buick", "cadillac", "mini", "smart", "acura", "bugatti",
                  "maserati", "lamborghini", "mclaren", "subaru", "kia", "hyundai", "royce", "rover"]),
    "Two First Names": dict(diff=0.85, picks=[
        "Christopher Lee", "Jason Lee", "Kurt Russell", "Lily James", "Theo James", "Keith David",
        "Tim Allen", "Sam Elliott", "Kyle Chandler", "Michael B. Jordan", "Andrew Lincoln",
        "Elisabeth Moss", "Jessica Alba", "Luke Wilson"], keywords=[]),
}

COLOR_WORDS = ["Black", "Green", "Brown", "Red", "Gold", "Grey", "Gray", "White", "Silver", "Scarlett",
               "Amber", "Ruby", "Violet", "Rose"]

NAME_KEYWORDS = ["King", "Knight", "Prince", "Duke", "Lord", "Major", "Little", "Short", "Long",
                 "Strong", "Young", "Wise", "Hart", "Good", "Black", "Green", "Brown", "White", "Gold"]

PIXAR = {"Toy Story", "Toy Story 2", "Toy Story 3", "Toy Story 4", "A Bug's Life", "Monsters, Inc.",
         "Monsters University", "Finding Nemo", "Finding Dory", "The Incredibles", "Incredibles 2", "Cars",
         "Cars 2", "Cars 3", "Ratatouille", "WALL·E", "Up", "Brave", "Inside Out", "Inside Out 2",
         "The Good Dinosaur", "Coco", "Onward", "Soul", "Luca", "Turning Red", "Lightyear", "Elemental", "Elio"}

MCU = {"Iron Man", "The Incredible Hulk", "Iron Man 2", "Thor", "Captain America: The First Avenger", "The Avengers",
       "Iron Man 3", "Thor: The Dark World", "Captain America: The Winter Soldier", "Guardians of the Galaxy",
       "Avengers: Age of Ultron", "Ant-Man", "Captain America: Civil War", "Doctor Strange",
       "Guardians of the Galaxy Vol. 2", "Spider-Man: Homecoming", "Thor: Ragnarok", "Black Panther",
       "Avengers: Infinity War", "Ant-Man and the Wasp", "Captain Marvel", "Avengers: Endgame",
       "Spider-Man: Far From Home", "Black Widow", "Shang-Chi and the Legend of the Ten Rings", "Eternals",
       "Spider-Man: No Way Home", "Doctor Strange in the Multiverse of Madness", "Thor: Love and Thunder",
       "Black Panther: Wakanda Forever", "Ant-Man and the Wasp: Quantumania", "Guardians of the Galaxy Vol. 3",
       "The Marvels", "Deadpool & Wolverine", "Captain America: Brave New World", "Thunderbolts*",
       "The Fantastic Four: First Steps"}
DC_KEYS = ["Batman", "Superman", "Justice League", "Wonder Woman", "Aquaman", "Shazam", "Suicide Squad", "Joker",
           "The Dark Knight", "Man of Steel", "Green Lantern", "Birds of Prey", "Black Adam", "The Flash",
           "Blue Beetle", "Catwoman", "Watchmen", "Constantine"]
BOND = {"Dr. No", "From Russia with Love", "Goldfinger", "Thunderball", "You Only Live Twice",
        "On Her Majesty's Secret Service", "Diamonds Are Forever", "Live and Let Die", "The Man with the Golden Gun",
        "The Spy Who Loved Me", "Moonraker", "For Your Eyes Only", "Octopussy", "A View to a Kill",
        "The Living Daylights", "Licence to Kill", "GoldenEye", "Tomorrow Never Dies", "The World Is Not Enough",
        "Die Another Day", "Casino Royale", "Quantum of Solace", "Skyfall", "Spectre", "No Time to Die",
        "Never Say Never Again"}

VOICE_FRANCHISES = {"Voiced a Toy Story Character", "Voiced a Shrek Character"}
# Computed "screen" groups: (base difficulty, rule on movie titles)
FRANCHISES = {
    "In a Harry Potter Movie": (0.25, lambda t: t.startswith("Harry Potter") or t.startswith("Fantastic Beasts")),
    "In a Star Wars Movie": (0.25, lambda t: t.startswith("Star Wars") or t in {"Rogue One: A Star Wars Story", "Solo: A Star Wars Story"}),
    "In an X-Men Movie": (0.35, lambda t: t.startswith("X-Men") or t in {"X2", "Logan", "The Wolverine", "Deadpool", "Deadpool 2", "Deadpool & Wolverine"}),
    "In a Fast & Furious Movie": (0.35, lambda t: ("Fast" in t and "Furious" in t) or t in {"Fast Five", "Furious 7", "Fast X", "2 Fast 2 Furious", "The Fate of the Furious", "F9"}),
    "In a Lord of the Rings or Hobbit Movie": (0.3, lambda t: t.startswith("The Lord of the Rings") or t.startswith("The Hobbit")),
    "In a Pirates of the Caribbean Movie": (0.35, lambda t: t.startswith("Pirates of the Caribbean")),
    "In a Hunger Games Movie": (0.35, lambda t: t.startswith("The Hunger Games")),
    "In a Jurassic Park or World Movie": (0.4, lambda t: t.startswith("Jurassic")),
    "In a Mission: Impossible Movie": (0.45, lambda t: t.startswith("Mission: Impossible")),
    "In a Twilight Movie": (0.4, lambda t: t.startswith("The Twilight Saga") or t == "Twilight"),
    "In an Avengers Movie": (0.3, lambda t: t.startswith("The Avengers") or t.startswith("Avengers")),
    "In a Batman Movie": (0.4, lambda t: "Batman" in t or t.startswith("The Dark Knight")),
    "In a Marvel Cinematic Universe Movie": (0.25, lambda t: t in MCU),
    "In a DC Superhero Movie": (0.35, lambda t: any(k in t for k in DC_KEYS)),
    "In a James Bond Movie": (0.4, lambda t: t in BOND),
    "In a Spider-Man Movie": (0.3, lambda t: "Spider-Man" in t or "Spider-Verse" in t),
    "In a Transformers Movie": (0.45, lambda t: t.startswith("Transformers") or t == "Bumblebee"),
    "In a Rocky or Creed Movie": (0.4, lambda t: t.startswith("Rocky") or t.startswith("Creed")),
    "In a Terminator Movie": (0.4, lambda t: "Terminator" in t),
    "In an Alien Movie": (0.45, lambda t: t in {"Alien", "Aliens", "Alien³", "Alien Resurrection", "Prometheus", "Alien: Covenant", "Alien: Romulus"}),
    "In a Matrix Movie": (0.35, lambda t: t.startswith("The Matrix")),
    "In a Bourne Movie": (0.45, lambda t: "Bourne" in t),
    "In an Ocean's Movie": (0.35, lambda t: t.startswith("Ocean's")),
    "In a Godfather Movie": (0.35, lambda t: t.startswith("The Godfather")),
    "In a Back to the Future Movie": (0.3, lambda t: t.startswith("Back to the Future")),
    "In an Indiana Jones Movie": (0.35, lambda t: "Indiana Jones" in t or t == "Raiders of the Lost Ark"),
    "In a Planet of the Apes Movie": (0.5, lambda t: "Planet of the Apes" in t),
    "In a Men in Black Movie": (0.4, lambda t: t.startswith("Men in Black")),
    "Voiced a Toy Story Character": (0.4, lambda t: t.startswith("Toy Story")),
    "In a Night at the Museum Movie": (0.45, lambda t: t.startswith("Night at the Museum")),
    "In a Meet the Parents Movie": (0.4, lambda t: t in {"Meet the Parents", "Meet the Fockers", "Little Fockers"}),
    "In a Hangover Movie": (0.35, lambda t: t.startswith("The Hangover")),
    "In a John Wick Movie": (0.4, lambda t: t.startswith("John Wick")),
    "In a Scream Movie": (0.45, lambda t: t.startswith("Scream")),
    "In a Conjuring Universe Movie": (0.55, lambda t: t.startswith("The Conjuring") or t.startswith("Annabelle") or t.startswith("The Nun")),
    "Voiced a Shrek Character": (0.5, lambda t: t.startswith("Shrek")),
}

# ==========================================
# 3. GROUP TEMPLATES
# A template is a possible group: everyone who qualifies (members) and who may be chosen (picks).
# ==========================================
NAME_FIRSTS = set(df['first_name'])


def _norm(n):
    return re.sub(r'[^a-z ]', '', n.lower())


def _groups(mapping):
    out = defaultdict(list)
    for n, v in mapping.items():
        if v:
            out[v].append(n)
    return out


def build_templates():
    T = []

    def add(title, slot, family, members, picks, diff, ref=None):
        picks = [p for p in picks if p in POOL]
        if family == 'name':
            picks = [p for p in picks if p not in RESTRICTED]
        if len(picks) >= 4:
            T.append(dict(title=title, slot=slot, family=family, members=set(members) | set(picks),
                          picks=picks, diff=diff, ident=title, ref=ref))

    by_movie, by_show = defaultdict(list), defaultdict(list)
    for n in ALL_NAMES:
        for m in MOVIE_SET[n]:
            by_movie[m].append(n)
        for s in TV_SET[n]:
            by_show[s].append(n)
    for m, names in by_movie.items():
        if m not in ANIMATED:          # voice casts are too hard to place
            picks = [n for n in names if (n, m) not in DEEP]
            add(f"In the movie '{m}'", 'screen', 'movie', names, picks, None, ref=m)
    for s, names in by_show.items():
        add(f"In the TV show '{s}'", 'screen', 'tv', names, names, None, ref=s)
    for title, (diff, rule) in FRANCHISES.items():
        voice = title in VOICE_FRANCHISES
        def fits(n, allow_deep):
            return any(rule(re.sub(r' \(\d{4}\)$', '', t)) and (voice or t not in ANIMATED)
                       and (allow_deep or (n, t) not in DEEP) for t in MOVIE_SET[n])
        members = [n for n in ALL_NAMES if fits(n, True)]
        names = [n for n in members if fits(n, False)]
        add(title, 'screen', 'franchise', members, names, diff)
    for title, g in HAND.items():
        slot = 'screen' if g['family'] == 'role' else 'other'
        add(title, slot, g['family'], set(g['picks']) | set(g['extra']), g['picks'], g['diff'])
    for title, g in NAME_LISTS.items():
        if title == "Two First Names":
            extra = {n for n in ALL_NAMES if len(n.split()) >= 2 and n.split()[-1] in NAME_FIRSTS}
        elif g.get('tokens'):
            extra = {n for n in ALL_NAMES if set(_norm(n).split()) & set(g['keywords'])}
        else:
            # match at the start of a name part ("Wolfhard", "Woodley"), not anywhere inside
            # ("Lawrence" must not count as a hidden "wren")
            extra = {n for n in ALL_NAMES if any(tok.startswith(k) for tok in _norm(n).split() for k in g['keywords'])}
        add(title, 'other', 'name', extra | set(g['picks']), g['picks'], g['diff'])
    for val, names in _groups(FIRST).items():
        add(f"First Name: {val}", 'other', 'name', names, names, 0.12, ref=val)
    for val, names in _groups(LAST).items():
        add(f"Last Name: {val}", 'other', 'name', names, names, 0.15, ref=val)
    for val, names in _groups(INITIALS).items():
        add(f"Initials: {val}", 'other', 'name', names, names, 0.3, ref=val)
    allit = [n for n in ALL_NAMES if len(n.split()) >= 2 and n.split()[0][0].upper() == n.split()[-1][0].upper()]
    add("Alliterative Names", 'other', 'name', allit, allit, 0.4)
    hyph = [n for n in ALL_NAMES if '-' in n]
    add("Hyphenated Names", 'other', 'name', hyph, hyph, 0.25)
    three = [n for n in ALL_NAMES if len(n.split()) == 3]
    add("Three-Part Names", 'other', 'name', three, three, 0.3)
    colors = [n for n in ALL_NAMES if any(tok.startswith(c) for tok in n.split() for c in COLOR_WORDS)]
    add("Hidden Colors", 'other', 'name', colors, colors, 0.7)
    for kw in NAME_KEYWORDS:
        names = [n for n in ALL_NAMES if re.search(rf'\b{kw}', n)]
        add(f"Names containing '{kw}'", 'other', 'name', names, names, 0.5, ref=kw)
    return T


TEMPLATES = build_templates()
SCREEN = [t for t in TEMPLATES if t['slot'] == 'screen']
OTHER = [t for t in TEMPLATES if t['slot'] == 'other']

# ==========================================
# 4. DIFFICULTY
# ==========================================
def billing_adj(names, title):
    """Leads are easy to place in a movie or show; supporting parts are hard."""
    adj = []
    for n in names:
        o = ORDER.get((n, title), 8)
        adj.append(-0.08 if o <= 2 else 0.0 if o <= 5 else 0.08 if o <= 9 else 0.15)
    return sum(adj) / len(adj)


RANK = dict(zip(df['name'], df['rank']))


def fame_adj(names):
    """Famous actors are easier to place: the four biggest names in the pool pull a group down,
    four lesser-known ones push it up. Ranks run 1 (most famous) to ~800."""
    mean_rank = sum(RANK.get(n, 600) for n in names) / len(names)
    return (mean_rank / len(RANK) - 0.4) * 0.3


def difficulty(t, names):
    if t['family'] == 'movie':
        votes = MOVIE_VOTES.get(t['ref'], 5000)
        return 0.42 - (math.log10(votes) - 4.0) * 0.25 + billing_adj(names, t['ref']) + fame_adj(names)
    if t['family'] == 'tv':
        # TV vote counts run ~3x lower than movies for the same fame
        votes = SHOW_VOTES.get(t['ref'], 2000) * 3
        return 0.42 - (math.log10(votes) - 4.0) * 0.25 + billing_adj(names, t['ref']) + fame_adj(names)
    return t['diff']



# Fixed tiers (0 yellow, 1 green, 2 blue, 3 purple) for everything except movie and TV groups,
# whose tier comes from how famous the title is and whether the four actors were leads.
FIXED_TIER = {
    # yellow
    "Played Batman": 0, "Played James Bond": 0, "Played Spider-Man": 0, "Played Catwoman": 0,
    "Played the Joker": 0, "In a Harry Potter Movie": 0, "In a Star Wars Movie": 0, "In an Avengers Movie": 0,
    "In a Marvel Cinematic Universe Movie": 0, "In a Back to the Future Movie": 0, "Hyphenated Names": 0,
    # green
    "Three-Part Names": 1, "Alliterative Names": 1, "Action Heroes": 1, "Rom-Com Icons": 1, "Child Stars": 1,
    "Former Disney Channel Stars": 1, "Started in Stand-Up": 1, "SNL Cast Members": 1, "Played Superman": 1,
    "Played the Hulk": 1, "Played Sherlock Holmes": 1, "Played a Batman Villain": 1, "Bond Girls": 1,
    "Played an Astronaut": 1, "Played a TV Doctor": 1, "In a Lord of the Rings or Hobbit Movie": 1,
    "In an X-Men Movie": 1, "In a Fast & Furious Movie": 1, "In a Pirates of the Caribbean Movie": 1,
    "In a Hunger Games Movie": 1, "In a Jurassic Park or World Movie": 1, "In a Twilight Movie": 1,
    "In a Batman Movie": 1, "In a DC Superhero Movie": 1, "In a James Bond Movie": 1, "In a Spider-Man Movie": 1,
    "In a Rocky or Creed Movie": 1, "In a Terminator Movie": 1, "In a Matrix Movie": 1, "In an Ocean's Movie": 1,
    "In a Godfather Movie": 1, "In an Indiana Jones Movie": 1, "In a Men in Black Movie": 1,
    "In a Meet the Parents Movie": 1, "In a Hangover Movie": 1, "In a John Wick Movie": 1,
    # blue
    "Hidden Colors": 2, "Scream Queens": 2, "Played a Boxer": 2, "Played the President": 2,
    "Played a Sports Coach": 2, "Played a Real Musician": 2, "Played a Bond Villain": 2, "Played Dr. Watson": 2,
    "Played Jack Ryan": 2, "Played Robin Hood": 2, "Played Elvis Presley": 2, "Has a Famous Acting Sibling": 2,
    "Knighted or Made a Dame": 2, "Hosted the Oscars": 2, "People's Sexiest Man Alive": 2,
    "In a Mission: Impossible Movie": 2, "In a Bourne Movie": 2, "In an Alien Movie": 2,
    "In a Planet of the Apes Movie": 2, "In a Transformers Movie": 2, "In a Night at the Museum Movie": 2,
    "In a Scream Movie": 2, "In a Conjuring Universe Movie": 2,
    # purple
    "Best Actor Oscar Winners": 3, "Best Actress Oscar Winners": 3, "Known by a Stage Name": 3,
    "Played Lex Luthor": 3, "Played Jesus": 3, "Played the Devil": 3, "Famously Played a 'John'": 3,
    "Famously Played a 'Jack'": 3, "Two First Names": 3,
    **{t: 3 for t in HAND if t.startswith("Famously Played")}, "Last Name Is a Job": 3, "Animal in the Last Name": 3,
    "Nature in the Last Name": 3, "Food in the Name": 3, "Place Name in the Name": 3, "Car Brand in the Name": 3,
    "Voiced a Toy Story Character": 3, "Voiced a Shrek Character": 3,
}
FIXED_PREFIX_TIER = {"First Name: ": 0, "Last Name: ": 0, "Initials: ": 1, "Names containing ": 2}


def fixed_tier(title):
    if title in FIXED_TIER:
        return FIXED_TIER[title]
    for prefix, tier in FIXED_PREFIX_TIER.items():
        if title.startswith(prefix):
            return tier
    return None

# Movie/TV cut points on the difficulty score (title fame + leads vs supporting + actor fame).
# Anchors: The Avengers with its leads 0.12 and Breaking Bad's leads 0.26 (yellow), Fast Five 0.36 (green),
# Gemini Man 0.41 (blue), Battleship / No Time to Die's supporting cast ~0.49 (purple).
TIER_CUTS = [0.30, 0.40, 0.47]


def tier_of(d):
    return sum(d >= c for c in TIER_CUTS)


# ==========================================
# 5. MEMORY (reuse limits)
# ==========================================
class Tracker:
    # Max uses of one group across the whole batch (per family)
    REUSE = {'tv': 30, 'franchise': 30, 'role': 15, 'award': 35, 'career': 30,
             'archetype': 30, 'life': 30, 'name': 40}
    SIMPLE_NAME_LIMIT = 20      # each "First Name: X" / "Last Name: X" / "Initials: X"
    MOVIE_WINDOW = 50           # a movie can't repeat within this many puzzles
    TRIO_WINDOW = 150           # the same 3 actors can't anchor the same group within this many puzzles

    def __init__(self):
        self.usage = Counter()
        self.movie_last = {}
        self.trios = {}             # (trio, group) -> last puzzle index
        self.foursomes = set()      # exact same 4 actors for the same group: never again

    TITLE_LIMIT = {"Best Actor Oscar Winners": 12, "Best Actress Oscar Winners": 12,
                   "People's Sexiest Man Alive": 20, "Knighted or Made a Dame": 20,
                   # curated name wordplay: about once every five weeks each
                   **{t: 20 for t in NAME_LISTS}, "Hidden Colors": 20,
                   "Known by a Stage Name": 20, "Voiced a Shrek Character": 20, "Voiced a Toy Story Character": 20}

    def ok(self, t, names, idx):
        if t['family'] == 'movie':
            last = self.movie_last.get(t['ident'])
            if last is not None and idx - last < self.MOVIE_WINDOW:
                return False
        else:
            lim = self.REUSE[t['family']]
            if t['title'].split(':')[0] in ('First Name', 'Last Name', 'Initials'):
                lim = self.SIMPLE_NAME_LIMIT
            lim = self.TITLE_LIMIT.get(t['title'], lim)
            if self.usage[t['ident']] >= lim:
                return False
        if (tuple(sorted(names)), t['ident']) in self.foursomes:
            return False
        return not any(idx - self.trios.get((trio, t['ident']), -10**9) < self.TRIO_WINDOW
                       for trio in itertools.combinations(sorted(names), 3))

    def add(self, t, names, idx):
        if t['family'] == 'movie':
            self.movie_last[t['ident']] = idx
        self.usage[t['ident']] += 1
        self.foursomes.add((tuple(sorted(names)), t['ident']))
        for trio in itertools.combinations(sorted(names), 3):
            self.trios[(trio, t['ident'])] = idx


tracker = Tracker()

# ==========================================
# 6. PUZZLE ASSEMBLY
# ==========================================
SCREEN_W = {'movie': 0.52, 'tv': 0.28, 'franchise': 0.12, 'role': 0.08}
OTHER_W = {'name': 0.4, 'award': 0.2, 'archetype': 0.15, 'career': 0.13, 'life': 0.12}
BY_FAMILY = defaultdict(list)
for _t in TEMPLATES:
    BY_FAMILY[_t['family']].append(_t)


def pick_template(weights):
    fam = random.choices(list(weights), weights=list(weights.values()))[0]
    return random.choice(BY_FAMILY[fam]) if BY_FAMILY[fam] else None


ACTOR_TEMPLATES = defaultdict(list)
for _i, _t in enumerate(TEMPLATES):
    for _n in _t['members']:
        ACTOR_TEMPLATES[_n].append(_i)


def count_solutions(board, limit=2):
    """How many ways can these 16 actors be split into four valid groups? (stops at `limit`)"""
    board = set(board)
    cands = set()
    for i in {i for n in board for i in ACTOR_TEMPLATES[n]}:
        inside = TEMPLATES[i]['members'] & board
        if len(inside) >= 4:
            for combo in itertools.combinations(sorted(inside), 4):
                cands.add(frozenset(combo))
    by_actor = defaultdict(list)
    for g in cands:
        for n in g:
            by_actor[n].append(g)
    found = 0

    def solve(left):
        nonlocal found
        if not left:
            found += 1
            return
        first = min(left, key=lambda n: len(by_actor[n]))
        for g in by_actor[first]:
            if g <= left:
                solve(left - g)
                if found >= limit:
                    return
    solve(frozenset(board))
    return found


def decoys(t, names, board):
    """Actors elsewhere on the board who also fit this group (red herrings)."""
    return len((t['members'] & set(board)) - set(names))


def try_group(t, used_tiers, puzzle, idx):
    board = {n for _, ns, _ in puzzle for n in ns}
    picks = [p for p in t['picks'] if p not in board]
    n_restricted = sum(n in RESTRICTED for n in board)
    n_low = sum(n in LOW_OPTION for n in board)
    for _ in range(8):
        if len(picks) < 4:
            return None
        names = random.sample(picks, 4)
        if n_restricted + sum(n in RESTRICTED for n in names) > 1:
            continue
        if any(n in ANCHORED and t['ref'] != ANCHORED[n] for n in names):
            continue
        if n_low + sum(n in LOW_OPTION for n in names) > 2:
            continue
        if t['family'] == 'name' and not t['title'].startswith('Last Name') and len({LAST[n] for n in names}) < 4:
            continue  # e.g. no Will Smith + Maggie Smith in "Last Name Is a Job"
        if not tracker.ok(t, names, idx):
            continue
        d = difficulty(t, names)
        ft = fixed_tier(t['title'])
        tier = ft if ft is not None else tier_of(d)
        return names, d, tier
    return None


def generate_puzzle(idx, attempts=4000):
    for _ in range(attempts):
        puzzle, used_tiers, n_screen = [], set(), 0
        for slot in ['screen', 'other', 'any', 'any']:
            placed = False
            for _ in range(25):
                kind = slot if slot != 'any' else random.choice(['screen', 'other'])
                if kind == 'screen' and n_screen >= MAX_SCREEN:
                    kind = 'other'
                t = pick_template(SCREEN_W if kind == 'screen' else OTHER_W)
                if t is None or any(g['ident'] == t['ident'] for g, _, _ in puzzle):
                    continue
                if t['family'] == 'tv' and any(g['family'] == 'tv' for g, _, _ in puzzle) and random.random() < 0.7:
                    continue  # a second TV group is allowed but rare
                res = try_group(t, used_tiers, puzzle, idx)
                if res:
                    names, d, tier = res
                    puzzle.append((t, names, (d, tier)))
                    n_screen += t['slot'] == 'screen'
                    placed = True
                    break
            if not placed:
                break
        if len(puzzle) == 4:
            board = [n for _, ns, _ in puzzle for n in ns]
            # Red herrings make a group harder: each decoy on the board bumps it up a tier.
            final = []
            for t, names, (d, base) in puzzle:
                dc = decoys(t, names, board)
                final.append((t, names, d, min(3, base + dc), dc))
            if sorted(f[3] for f in final) != [0, 1, 2, 3]:
                continue
            if count_solutions(board) != 1:
                continue
            for t, names, *_ in final:
                tracker.add(t, names, idx)
            return [dict(title=t['title'], type=t['family'], tier=tier, decoys=dc, difficulty=round(d, 3),
                         actors=[dict(name=n, profile_path=PROFILE[n] or None) for n in names])
                    for t, names, d, tier, dc in sorted(final, key=lambda x: x[3])]
    return None


def calibrate(samples=8000):
    """Put the movie/TV tier cut points at the quartiles of movie/TV group difficulty."""
    ds = []
    for _ in range(samples):
        t = random.choice(BY_FAMILY['movie'] + BY_FAMILY['tv'])
        ds.append(difficulty(t, random.sample(t['picks'], 4)))
    ds.sort()
    return [ds[int(len(ds) * q)] for q in (0.25, 0.5, 0.75)]


def main():
    global TIER_CUTS
    random.seed(2026)
    print('Movie/TV tier cut points:', TIER_CUTS)
    fam = Counter(t['family'] for t in TEMPLATES)
    print(f'{len(TEMPLATES)} group templates {dict(fam)}, {len(POOL)} actors')

    try:
        old = json.load(open(OUTPUT))
    except FileNotFoundError:
        old = []
    today_idx = (date.today() - START_DATE).days
    kept = old[:today_idx]
    print(f'Keeping {len(kept)} published puzzles; new puzzles start today (puzzle #{today_idx + 1})')

    new = []
    while len(new) < TARGET:
        p = generate_puzzle(len(new))
        if p is None:
            print(f'  Stalled at {len(new)} new puzzles: add more groups or data to go further.')
            break
        new.append(p)
        if len(new) % 50 == 0:
            print(f'  [{len(new)}/{TARGET}]', flush=True)

    with open(OUTPUT, 'w') as f:
        json.dump(kept + new, f, indent=1)
    print(f'Saved {len(kept)} kept + {len(new)} new = {len(kept) + len(new)} puzzles to {OUTPUT}')


if __name__ == '__main__':
    main()
