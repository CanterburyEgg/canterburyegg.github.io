import pandas as pd
import random
import re
import itertools
import os
import json

# ==========================================
# 1. DATA LOADING & PREP
# ==========================================
csv_path = 'lists/top_600_enriched.csv'
df = pd.read_csv(csv_path)

top_movies_df = pd.read_csv('lists/top_movies.csv')
TOP_MOVIES_LIST = set(top_movies_df['title'].tolist())

# Normalize data
df['height'] = df['height'].astype(str).replace('nan', '')
df['birth_year'] = pd.to_numeric(df['birth_year'], errors='coerce')
df['alma_mater'] = df['alma_mater'].fillna('')
df['spouse'] = df['spouse'].fillna('')
df['birth_place'] = df['birth_place'].fillna('')
df['movie_credits'] = df['movie_credits'].fillna('')
df['tv_shows'] = df['tv_shows'].fillna('')
df['gender'] = df['gender'].fillna('Unknown')

# Pre-compute common maps
SPOUSE_MAP = {}
for _, row in df.iterrows():
    actor = row['name']
    s_list = [s.strip() for s in str(row['spouse']).split(',')]
    for s in s_list:
        if s and s != "nan" and len(s) > 2:
            if s not in SPOUSE_MAP: SPOUSE_MAP[s] = []
            SPOUSE_MAP[s].append(actor)

# ==========================================
# 2. MANUAL DATA & CONSTANTS
# ==========================================
MANUAL = {
    "played_same_character": {
        "Played Sherlock Holmes": ["Robert Downey Jr.", "Benedict Cumberbatch", "Henry Cavill", "Ian McKellen", "Jonny Lee Miller", "Will Ferrell"],
        "Played The Joker": ["Heath Ledger", "Joaquin Phoenix", "Jack Nicholson", "Jared Leto", "Barry Keoghan"],
        "Played Batman": ["Christian Bale", "Robert Pattinson", "Ben Affleck", "Michael Keaton", "George Clooney", "Val Kilmer"],
        "Played Elvis Presley": ["Austin Butler", "Jacob Elordi", "Kurt Russell", "Jonathan Rhys Meyers", "Michael Shannon"],
        "Played James Bond": ["Daniel Craig", "Pierce Brosnan", "Roger Moore", "Sean Connery", "Timothy Dalton", "George Lazenby"],
        "Played The Hulk": ["Mark Ruffalo", "Edward Norton", "Eric Bana", "Lou Ferrigno"],
        "Played Robin Hood": ["Taron Egerton", "Russell Crowe", "Kevin Costner", "Cary Elwes", "Sean Connery"],
        "Played Jack Ryan": ["John Krasinski", "Chris Pine", "Ben Affleck", "Harrison Ford", "Alec Baldwin"]
    },
    "awards_and_honors": {
        "Three-Quarter EGOTs": ["Hugh Jackman", "Kate Winslet", "Cher", "Al Pacino", "Helen Mirren", "Jeremy Irons", "Frances McDormand", "Jessica Lange", "Geoffrey Rush", "Ellen Burstyn", "Anne Hathaway", "Common", "John Legend", "Viola Davis"],
        "People's Sexiest Man Alive": ["Adam Levine", "Ben Affleck", "Blake Shelton", "Brad Pitt", "Bradley Cooper", "Channing Tatum", "Chris Evans", "Chris Hemsworth", "David Beckham", "Denzel Washington", "Dwayne Johnson", "George Clooney", "Harrison Ford", "Harry Hamlin", "Heath Ledger", "Hugh Jackman", "Idris Elba", "John F. Kennedy Jr.", "John Krasinski", "John Legend", "Johnny Depp", "Jonathan Bailey", "Jude Law", "Keanu Reeves", "Mark Harmon", "Matt Damon", "Matthew McConaughey", "Mel Gibson", "Michael B. Jordan", "Nick Nolte", "Patrick Dempsey", "Patrick Swayze", "Paul Rudd", "Pierce Brosnan", "Richard Gere", "Ryan Reynolds", "Sean Connery", "Tom Cruise"],
        "People's Most Beautiful": ["Angelina Jolie", "Beyoncé", "Catherine Zeta-Jones", "Chrissy Teigen", "Christina Applegate", "Cindy Crawford", "Courteney Cox", "Demi Moore", "Drew Barrymore", "Goldie Hawn", "Gwyneth Paltrow", "Halle Berry", "Helen Mirren", "Jennifer Aniston", "Jennifer Garner", "Jennifer Lopez", "Jodie Foster", "Julia Roberts", "Kate Hudson", "Leonardo DiCaprio", "Lupita Nyong'o", "Meg Ryan", "Mel Gibson", "Melissa McCarthy", "Michelle Pfeiffer", "Nicole Kidman", "Pink", "Sandra Bullock", "Sofía Vergara", "Tom Cruise"],
        "Best Actor Winners": ["Adrien Brody", "Al Pacino", "Anthony Hopkins", "Art Carney", "Ben Kingsley", "Bing Crosby", "Brendan Fraser", "Broderick Crawford", "Burt Lancaster", "Casey Affleck", "Charles Laughton", "Charlton Heston", "Christopher Plummer", "Cillian Murphy", "Clark Gable", "Cliff Robertson", "Colin Firth", "Daniel Day-Lewis", "Dustin Hoffman", "Eddie Redmayne", "Ernest Borgnine", "F. Murray Abraham", "Forest Whitaker", "Fredric March", "Gary Cooper", "Gary Oldman", "Gene Hackman", "Geoffrey Rush", "George Arliss", "George C. Scott", "Gregory Peck", "Humphrey Bogart", "Jack Lemmon", "Jack Nicholson", "James Cagney", "James Stewart", "Jamie Foxx", "Jean Dujardin", "Jeff Bridges", "Jeremy Irons", "Joaquin Phoenix", "John Wayne", "Jon Voight", "José Ferrer", "Kevin Spacey", "Laurence Olivier", "Lee Marvin", "Leonardo DiCaprio", "Lionel Barrymore", "Marlon Brando", "Matthew McConaughey", "Maximilian Schell", "Michael Douglas", "Nicolas Cage", "Paul Lucas", "Paul Muni", "Paul Newman", "Paul Scofield", "Peter Finch", "Philip Seymour Hoffman", "Rami Malek", "Ray Milland", "Richard Dreyfuss", "Robert De Niro", "Robert Donat", "Robert Duvall", "Roberto Benigni", "Rod Steiger", "Ronald Colman", "Russell Crowe", "Sean Penn", "Sidney Poitier", "Spencer Tracy", "Tom Hanks", "Vicente Minnelli", "Victor McLaglen", "Warner Baxter", "Will Smith", "William Holden", "William Hurt", "Yul Brunner"],
        "Best Actress Winners": ["Anne Bancroft", "Audrey Hepburn", "Barlbara Stanwyck", "Bette Davis", "Brie Larson", "Cate Blanchett", "Charlize Theron", "Cher", "Claudette Colbert", "Diane Keaton", "Elizabeth Taylor", "Ellen Burstyn", "Emma Stone", "Emma Thompson", "Faye Dunaway", "Frances McDormand", "Geraldine Page", "Glenda Jackson", "Grace Kelly", "Gwyneth Paltrow", "Halle Berry", "Helen Hunt", "Helen Mirren", "Hilary Swank", "Holly Hunter", "Ingrid Bergman", "Jane Fonda", "Janet Gaynor", "Jennifer Lawrence", "Jessica Chastain", "Jessica Lange", "Jessica Tandy", "Joan Crawford", "Joan Fontaine", "Jodie Foster", "Judy Holliday", "Julie Andrews", "Julie Christie", "Julia Roberts", "Julianne Moore", "Kate Winslet", "Katharine Hepburn", "Liza Nikki", "Loretta Young", "Louise Fletcher", "Maggie Smith", "Marie Dressler", "Marion Cotillard", "Mary Pickford", "Meryl Streep", "Michelle Yeoh", "Mikey Madison", "Natalie Portman", "Nicole Kidman", "Olivia Colman", "Olivia de Havilland", "Patricia Neal", "Reese Witherspoon", "Renée Zellweger", "Sally Field", "Sandra Bullock", "Shirley Booth", "Shirley MacLaine", "Simone Signoret", "Sissy Spacek", "Susan Hayward", "Susan Sarandon", "Vivien Leigh"],
        "Supporting Actor Winners": ["Alan Arkin", "Anthony Quinn", "Barry Fitzgerald", "Benicio del Toro", "Burl Ives", "Charles Coburn", "Chris Cooper", "Christian Bale", "Christoph Waltz", "Christopher Plummer", "Christopher Walken", "Cuba Gooding Jr.", "Daniel Kaluuya", "Dean Jagger", "Denzel Washington", "Don Ameche", "Donald Crisp", "Ed Begley", "Edmond O'Brien", "Edmund Gwenn", "Frank Sinatra", "George Chakiris", "George Clooney", "George Kennedy", "George Sanders", "Haing S. Ngor", "Harold Russell", "Heath Ledger", "Hugh Griffith", "J.K. Simmons", "Jack Albertson", "Jack Lemmon", "Jack Nicholson", "Jack Palance", "James Coburn", "Jared Leto", "Jason Robards", "Javier Bardem", "Jim Broadbent", "Joe Pesci", "Joel Grey", "John Gielgud", "John Houseman", "John Mills", "Joseph Schildkraut", "Karl Malden", "Ke Huy Quan", "Kevin Kline", "Kevin Spacey", "Kieran Culkin", "Louis Gossett Jr.", "Mahershala Ali", "Mark Rylance", "Martin Balsam", "Martin Landau", "Melvyn Douglas", "Michael Caine", "Morgan Freeman", "Peter Ustinov", "Red Buttons", "Robert De Niro", "Robert Downey Jr.", "Robin Williams", "Sam Rockwell", "Sean Connery", "Thomas Mitchell", "Tim Robbins", "Timothy Hutton", "Tommy Lee Jones", "Troy Kotsur", "Van Heflin", "Walter Brennan", "Walter Huston", "Walter Matthau"],
        "Supporting Actress Winners": ["Alicia Vikander", "Alice Brady", "Allison Janney", "Angelina Jolie", "Anna Paquin", "Anne Baxter", "Anne Hathaway", "Anne Revere", "Anjelica Huston", "Ariana DeBose", "Beatrice Straight", "Brenda Fricker", "Cate Blanchett", "Catherine Zeta-Jones", "Celeste Holm", "Cloris Leachman", "Claire Trevor", "Da'Vine Joy Randolph", "Dianne Wiest", "Donna Reed", "Dorothy Malone", "Eileen Heckart", "Estelle Parsons", "Ethel Barrymore", "Eva Marie Saint", "Fay Bainter", "Gale Sondergaard", "Geena Davis", "Gloria Grahame", "Goldie Hawn", "Hattie McDaniel", "Helen Hayes", "Ingrid Bergman", "Jamie Lee Curtis", "Jane Darwell", "Jennifer Connelly", "Jennifer Hudson", "Jessica Lange", "Jo Van Fleet", "Josephine Hull", "Judi Dench", "Juliette Binoche", "Katina Paxinou", "Kim Basinger", "Kim Hunter", "Laura Dern", "Lee Grant", "Linda Hunt", "Lupita Nyong'o", "Maggie Smith", "Marcia Gay Harden", "Marisa Tomei", "Mary Astor", "Mary Steenburgen", "Maureen Stapleton", "Melissa Leo", "Mercedes McCambridge", "Mercedes Ruehl", "Meryl Streep", "Mira Sorvino", "Miyoshi Umeki", "Mo'Nique", "Octavia Spencer", "Olympia Dukakis", "Patricia Arquette", "Peggy Ashcroft", "Penélope Cruz", "Rachel Weisz", "Regina King", "Renée Zellweger", "Rita Moreno", "Ruth Gordon", "Sandy Dennis", "Shelley Winters", "Tatum O'Neal", "Teresa Wright", "Tilda Swinton", "Vanessa Redgrave", "Viola Davis", "Wendy Hiller", "Whoopi Goldberg", "Yuh-Jung Youn", "Zoe Saldaña"],
        "Biopic Oscar Winners": ["Adrien Brody", "Charlize Theron", "Eddie Redmayne", "Gary Oldman", "Helen Mirren", "Jamie Foxx", "Marion Cotillard", "Meryl Streep", "Philip Seymour Hoffman", "Rami Malek", "Reese Witherspoon", "Robert De Niro", "Sean Penn"],
        "SNL Five-Timers Club": ["Alec Baldwin", "Bill Murray", "Christopher Walken", "Danny DeVito", "Drew Barrymore", "Dwayne Johnson", "Emma Stone", "John Goodman", "Justin Timberlake", "Paul Rudd", "Scarlett Johansson", "Steve Martin", "Tom Hanks"]
    },
    "life_facts": {
        "Sirs and Dames": ["Anthony Hopkins", "Ian McKellen", "Patrick Stewart", "Michael Caine", "Ben Kingsley", "Daniel Day-Lewis", "Kenneth Branagh", "Judi Dench", "Maggie Smith", "Helen Mirren", "Emma Thompson", "Julie Andrews", "Kristin Scott Thomas", "Mark Rylance", "Olivia Colman"],
        "Dual Citizenship": ["Nicole Kidman", "Andrew Garfield", "Emily Blunt", "Jim Carrey", "Charlize Theron", "Natalie Portman", "Colin Farrell", "Liam Neeson", "Pierce Brosnan", "Keanu Reeves", "Salma Hayek", "Kirsten Dunst", "Anya Taylor-Joy", "Florence Pugh", "Mila Kunis"],
        "Natural Redheads": ["Amy Adams", "Jessica Chastain", "Julianne Moore", "Bryce Dallas Howard", "Karen Gillan", "Isla Fisher", "Domhnall Gleeson", "Eddie Redmayne", "Benedict Cumberbatch", "Nicole Kidman", "Sophie Turner", "Lindsay Lohan", "Christina Hendricks", "Damian Lewis", "Rupert Grint", "Seth Green"],
        "Adopted Children": ["Jamie Foxx", "Ray Liotta", "Frances McDormand", "Keegan-Michael Key", "Kristin Chenoweth", "Melissa Gilbert", "Debbie Harry", "Tracey Gold", "Nicole Richie", "Steve Jobs", "Michael Bay", "Barry Keoghan", "Richard Pryor", "Jack Nicholson", "Marilyn Monroe"],
        "Child Stars": ["Scarlett Johansson", "Millie Bobby Brown", "Elle Fanning", "Dafne Keen", "Drew Barrymore", "Joaquin Phoenix", "Leonardo DiCaprio", "Christian Bale", "Natalie Portman", "Emma Watson", "Jake Gyllenhaal", "Dakota Fanning", "Kirsten Dunst", "Sean Astin", "Tom Holland", "Freddie Highmore", "Chloë Grace Moretz", "Jodie Foster", "Elijah Wood", "Daniel Radcliffe", "Abigail Breslin", "Jaden Smith", "Macaulay Culkin", "Haley Joel Osment", "Michael J. Fox", "Edward Furlong"],
        "Nepo Babies": ["Bryce Dallas Howard", "Dakota Johnson", "Drew Barrymore", "Emma Roberts", "Gwyneth Paltrow", "Jack Quaid", "Jamie Lee Curtis", "John David Washington", "Kate Hudson", "Lily-Rose Depp", "Maya Hawke", "Zoë Kravitz"]
    },
    "brand_ambassadors": {
        "Prada": ["Hunter Schafer", "Damson Idris", "Carey Mulligan", "Maya Hawke", "Letitia Wright", "Harris Dickinson", "Scarlett Johansson", "Jeff Goldblum"],
        "Gucci": ["Dakota Johnson", "Ryan Gosling", "Jessica Chastain", "Idris Elba", "Alia Bhatt", "Paul Mescal", "Ni Ni", "Xiao Zhan"],
        "Calvin Klein": ["Jeremy Allen White", "Aaron Taylor-Johnson", "Michael B. Jordan", "Jacob Elordi", "Mark Wahlberg", "Millie Bobby Brown", "Jamie Dornan", "Anthony Ramos"],
        "Cartier": ["Timothée Chalamet", "Zoe Saldaña", "Jacob Elordi", "Gemma Chan", "Elle Fanning", "Rami Malek", "Vanessa Kirby", "Austin Butler"],
        "Dior": ["Anya Taylor-Joy", "Charlize Theron", "Jennifer Lawrence", "Johnny Depp", "Natalie Portman", "Robert Pattinson", "Rosamund Pike", "Elizabeth Debicki"],
        "Chanel": ["Keira Knightley", "Kristen Stewart", "Lily-Rose Depp", "Margot Robbie", "Penélope Cruz", "Tilda Swinton", "Timothée Chalamet", "Margaret Qualley"],
        "Louis Vuitton": ["Alicia Vikander", "Bradley Cooper", "Cate Blanchett", "Emma Stone", "Jennifer Connelly", "Léa Seydoux", "Zendaya", "Ana de Armas"],
        "Omega": ["Daniel Craig", "Eddie Redmayne", "George Clooney", "Nicole Kidman", "Zoe Kravitz", "Barry Keoghan", "Cillian Murphy", "Andrew Garfield"],
        "Tag Heuer": ["Alexandra Daddario", "Patrick Dempsey", "Ryan Gosling", "Jacob Elordi", "Wi Ha-jun"]
    },
    "performance_archetypes": {
        "Gender-Swapped Roles": ["Cate Blanchett", "Cillian Murphy", "Eddie Redmayne", "Jared Leto", "Tilda Swinton", "Robin Williams", "John Travolta", "Dustin Hoffman", "Guy Pearce", "Elle Fanning", "Hilary Swank", "Gael García Bernal", "Benedict Cumberbatch", "Hugo Weaving"],
        "Scream Queens": ["Jamie Lee Curtis", "Neve Campbell", "Courteney Cox", "Sarah Michelle Gellar", "Winona Ryder", "Drew Barrymore", "Anya Taylor-Joy", "Jenna Ortega", "Toni Collette", "Vera Farmiga", "Abigail Breslin", "Mia Goth", "Lupita Nyong'o"],
        "Action Heroes": ["Arnold Schwarzenegger", "Sylvester Stallone", "Bruce Willis", "Tom Cruise", "Jason Statham", "Keanu Reeves", "Vin Diesel", "Dwayne Johnson", "Jackie Chan", "Linda Hamilton", "Sigourney Weaver", "Charlize Theron", "Michelle Rodriguez"],
        "Rom-Com Icons": ["Julia Roberts", "Hugh Grant", "Meg Ryan", "Tom Hanks", "Jennifer Aniston", "Matthew McConaughey", "Sandra Bullock", "Reese Witherspoon", "Drew Barrymore", "Cameron Diaz", "Richard Gere", "Bradley Cooper", "Ryan Gosling"],
        "Played Multiple Characters in Super Universes": ["Aaron Taylor-Johnson", "Alfre Woodard", "Benedict Cumberbatch", "Chris Evans", "Gemma Chan", "Hailee Steinfeld", "Jason Momoa", "Josh Brolin", "Michael B. Jordan", "Michelle Yeoh", "Oscar Isaac", "Ryan Reynolds"],
        "Method Actors": ["Al Pacino", "Christian Bale", "Daniel Day-Lewis", "Dustin Hoffman", "Heath Ledger", "Jack Nicholson", "Jared Leto", "Jim Carrey", "Joaquin Phoenix", "Marlon Brando", "Robert De Niro", "Val Kilmer"],
        "Known by Stage Names": ["Whoopi Goldberg", "Vin Diesel", "Jamie Foxx", "Michael Caine", "Michael Keaton", "Nicolas Cage", "Emma Stone", "Natalie Portman", "Joaquin Phoenix", "Olivia Wilde", "Brie Larson", "Helen Mirren", "Julianne Moore", "Sigourney Weaver", "Charlie Sheen", "John Wayne", "Cary Grant", "Marilyn Monroe", "Judy Garland", "Rita Hayworth", "Kirk Douglas", "Ben Kingsley"]
    },
    "directorial_muses": {
        "Martin Scorsese": ["Robert De Niro", "Harvey Keitel", "Joe Pesci", "Leonardo DiCaprio"],
        "Wes Anderson": ["Bill Murray", "Owen Wilson", "Willem Dafoe", "Jeff Goldblum", "Edward Norton", "Tilda Swinton", "Ralph Fiennes", "Adrien Brody", "Benedict Cumberbatch", "Ben Kingsley", "Bryan Cranston"],
        "Quentin Tarantino": ["Tim Roth", "Quentin Tarantino", "Kurt Russell", "Michael Madsen", "Uma Thurman", "Daryl Hannah", "Samuel L. Jackson"],
        "Christopher Nolan": ["Cillian Murphy", "Kenneth Branagh", "Tom Hardy", "Michael Caine", "Anne Hathaway", "Christian Bale", "Gary Oldman"],
        "Joel Coen": ["John Goodman", "Steve Buscemi", "George Clooney", "Frances McDormand", "Josh Brolin"],
        "Tim Burton": ["Danny DeVito", "Johnny Depp", "Helena Bonham Carter", "Winona Ryder", "Michael Keaton", "Eva Green"],
        "Spike Lee": ["John Leguizamo", "Samuel L. Jackson", "Delroy Lindo", "Giancarlo Esposito"],
        "Ridley Scott": ["Russell Crowe", "Joaquin Phoenix", "Connie Nielsen", "Sigourney Weaver", "Michael Fassbender"],
        "James Cameron": ["Arnold Schwarzenegger", "Linda Hamilton", "Kate Winslet", "Sigourney Weaver", "Sam Worthington", "Zoe Saldaña", "Stephen Lang"]
    },
    "cameos": {
        "Friends": ["Ben Stiller", "Brad Pitt", "Bruce Willis", "Catherine Bell", "Dakota Fanning", "Danny DeVito", "Dermot Mulroney", "Gary Oldman", "George Clooney", "Helen Hunt", "Jeff Goldblum", "Julia Roberts", "Noah Wyle", "Rachael Harris", "Rebecca Romijn", "Reese Witherspoon", "Robin Williams", "Winona Ryder"],
        "The Office": ["Amy Adams", "Bill Hader", "Bob Odenkirk", "Dakota Johnson", "Evan Peters", "Jack Black", "Jim Carrey", "Rachael Harris", "Ricky Gervais", "Takayo Fischer", "Timothy Olyphant"],
        "30 Rock": ["Bill Hader", "Bryan Cranston", "Chloë Grace Moretz", "Christopher Walken", "David Schwimmer", "Don Cheadle", "Edie Falco", "Emma Stone", "James Franco", "Jennifer Aniston", "Jim Carrey", "John Lithgow", "Jon Hamm", "Kelsey Grammer", "Kristen Wiig", "Matt Damon", "Matthew Broderick", "Michael Keaton", "Paul Giamatti", "Peter Dinklage", "Robert De Niro", "Stanley Tucci", "Tom Hanks"]
    }
}

RESTRICTED_KEYWORDS = {
    "Colors": ["Black", "Brown", "Green", "Grey", "White", "Silver", "Gold", "Berry"],
    "Animals": ["Bear", "Bull", "Drake", "Fox", "Hawk", "Lamb", "Phoenix", "Wolf", "Crabb"],
    "Occupations": ["Baker", "Butler", "Cook", "Fisher", "Gardner", "Miller", "Page", "Smith", "Taylor", "Potter"],
    "Royalty": ["King", "Knight", "Prince", "Duke", "Earl", "Baron", "Lord", "Queen", "Major"],
    "Nature": ["Wood", "Stone", "Hill", "Lake", "River", "Field", "Bush", "Marsh", "Forest"],
    "Weather": ["Snow", "Rain", "Storm", "Gale", "Frost", "Cloud", "Sunny", "Wind"],
    "Directions": ["North", "West", "East", "South", "Southern"],
    "Measurements": ["Little", "Short", "Long", "Small", "Biggs", "Miles", "Inch"]
}

IVIES = ['Harvard', 'Yale', 'Princeton', 'Columbia', 'UPenn', 'Brown', 'Dartmouth', 'Cornell']

# ==========================================
# 3. HELPER FUNCTIONS
# ==========================================

def package_actors(names):
    res = []
    for n in names:
        path = df.loc[df['name'] == n, 'profile_path'].values[0]
        res.append({"name": n, "profile_path": path})
    return res

# --- CATEGORY LOGIC ---

def get_same_movie_cat(pool, current_idx):
    pool_copy = pool.sample(frac=1).reset_index(drop=True)
    movie_counts = {}
    for _, row in pool_copy.iterrows():
        movies = [m.strip() for m in row['movie_credits'].split('|') if m.strip()]
        for m in movies:
            movie_counts[m] = movie_counts.get(m, 0) + 1
    
    potential = [m for m, count in movie_counts.items() if count >= 4 and m in TOP_MOVIES_LIST]
    random.shuffle(potential)
    
    for m in potential:
        names = pool_copy[pool_copy['movie_credits'].str.contains(re.escape(m), na=False)]['name'].tolist()
        actors = random.sample(names, 4)
        if is_cat_valid(actors, m, "movie", current_idx):
            return {"title": f"In the movie '{m}'", "actors": package_actors(actors), "type": "movie", "ref": m}
    return None

def get_aux_movie_cat(pool, current_idx):
    secs = ["played_same_character", "directorial_muses"]
    random.shuffle(secs)
    for sec in secs:
        keys = list(MANUAL[sec].keys())
        random.shuffle(keys)
        for key in keys:
            matches = [n for n in MANUAL[sec][key] if n in pool['name'].values]
            if len(matches) >= 4:
                actors = random.sample(matches, 4)
                if is_cat_valid(actors, key, "performance" if sec == "directorial_muses" else "char", current_idx, subtype=sec):
                    stype = "char" if sec == "played_same_character" else "performance"
                    return {"title": key, "actors": package_actors(actors), "type": stype, "subtype": sec}
    return None

def get_awards_cat(pool, current_idx):
    keys = list(MANUAL["awards_and_honors"].keys())
    random.shuffle(keys)
    for key in keys:
        matches = [n for n in MANUAL["awards_and_honors"][key] if n in pool['name'].values]
        if len(matches) >= 4:
            actors = random.sample(matches, 4)
            if is_cat_valid(actors, key, "award", current_idx):
                return {"title": key, "actors": package_actors(actors), "type": "award"}
    return None

def get_performance_cat(pool, current_idx):
    secs = ["performance_archetypes", "cameos"]
    random.shuffle(secs)
    for sec in secs:
        keys = list(MANUAL[sec].keys())
        random.shuffle(keys)
        for key in keys:
            matches = [n for n in MANUAL[sec][key] if n in pool['name'].values]
            if len(matches) >= 4:
                actors = random.sample(matches, 4)
                if is_cat_valid(actors, key, "tv" if sec == "cameos" else "performance", current_idx, subtype=sec):
                    stype = "tv" if sec == "cameos" else "performance"
                    return {"title": key, "actors": package_actors(actors), "type": stype, "subtype": sec}
    return None

def get_name_cat(pool, current_idx):
    roll = random.random()
    if roll < 0.10: 
        all_restricted = []
        for kw_list in RESTRICTED_KEYWORDS.values():
            for kw in kw_list:
                matches = pool[pool['name'].str.contains(rf'\b{kw}\b', case=False, na=False)]['name'].tolist()
                if len(matches) >= 4: all_restricted.append((kw, matches))
        random.shuffle(all_restricted)
        for kw, m in all_restricted:
            actors = random.sample(m, 4)
            if is_cat_valid(actors, kw, "name", current_idx):
                return {"title": f"Names containing '{kw}'", "actors": package_actors(actors), "type": "name", "ref": kw}
    
    sub_roll = random.random()
    if sub_roll < 0.4: # First Name
        counts = pool['first_name'].value_counts()
        targets = counts[counts >= 4].index.tolist()
        random.shuffle(targets)
        for val in targets:
            m = pool[pool['first_name'] == val]['name'].tolist()
            actors = random.sample(m, 4)
            if is_cat_valid(actors, val, "name", current_idx):
                return {"title": f"First Name: {val}", "actors": package_actors(actors), "type": "name", "ref": val}
    elif sub_roll < 0.8: # Initials
        counts = pool['initials'].value_counts()
        targets = counts[counts >= 4].index.tolist()
        random.shuffle(targets)
        for val in targets:
            m = pool[pool['initials'] == val]['name'].tolist()
            actors = random.sample(m, 4)
            if is_cat_valid(actors, val, "name", current_idx):
                return {"title": f"Initials: {val}", "actors": package_actors(actors), "type": "name", "ref": val}
    else: # Specialty
        specs = ["allit", "hyphen", "three"]
        random.shuffle(specs)
        titles = {"allit": "Alliterative Names", "hyphen": "Hyphenated Names", "three": "Three Names"}
        for spec in specs:
            if spec == "allit":
                m = pool[pool['name'].apply(lambda x: len(x.split()) >= 2 and x.split()[0][0].upper() == x.split()[-1][0].upper())]['name'].tolist()
            elif spec == "hyphen":
                m = pool[pool['name'].str.contains('-', na=False)]['name'].tolist()
            else:
                m = pool[pool['name'].apply(lambda x: len(x.split()) == 3)]['name'].tolist()
            if len(m) >= 4:
                actors = random.sample(m, 4)
                if is_cat_valid(actors, titles[spec], "name", current_idx):
                    return {"title": titles[spec], "actors": package_actors(actors), "type": "name"}
    return None

def get_life_cat(pool, used_subtypes, current_idx):
    options = ["Height", "Birth Place", "Alma Mater", "Ivy", "Birth Year", "Ambassador"] + list(MANUAL["life_facts"].keys())
    random.shuffle(options)
    for opt in options:
        if opt in used_subtypes: continue
        if opt == "Height":
            valid = pool[(pool['height'] != '') & (pool['height'] != '6ft 0')]
            targets = valid['height'].value_counts()[lambda x: x >= 4].index.tolist()
            random.shuffle(targets)
            for h in targets:
                m = valid[valid['height'] == h]
                if m['gender'].nunique() >= 2:
                    actors = random.sample(m['name'].tolist(), 4)
                    if is_cat_valid(actors, h, "life", current_idx, subtype="Height"):
                        return {"title": f"Height: {h}", "actors": package_actors(actors), "type": "life", "subtype": "Height", "ref": h}
        elif opt == "Birth Place":
            pool_c = pool.copy()
            pool_c['country'] = pool_c['birth_place'].apply(lambda x: x.split(',')[-1].strip())
            non_us = pool_c[~pool_c['country'].isin(['USA', 'United States', 'US'])]
            targets = non_us['country'].value_counts()[lambda x: x >= 4].index.tolist()
            random.shuffle(targets)
            for c in targets:
                m = non_us[non_us['country'] == c]['name'].tolist()
                actors = random.sample(m, 4)
                if is_cat_valid(actors, c, "life", current_idx, subtype="Birth Place"):
                    return {"title": f"Born in {c}", "actors": package_actors(actors), "type": "life", "subtype": "Birth Place", "ref": c}
        elif opt == "Alma Mater":
            schools = ["Juilliard", "NYU", "Yale", "Oxford", "Cambridge", "RADA", "UCLA", "USC"]
            random.shuffle(schools)
            for s in schools:
                m = pool[pool['alma_mater'].str.contains(s, case=False, na=False)]['name'].tolist()
                if len(m) >= 4:
                    actors = random.sample(m, 4)
                    if is_cat_valid(actors, s, "life", current_idx, subtype="Alma Mater"):
                        return {"title": f"{s} Alumni", "actors": package_actors(actors), "type": "life", "subtype": "Alma Mater", "ref": s}
        elif opt == "Ivy":
            m = pool[pool['alma_mater'].str.contains('|'.join(IVIES), case=False, na=False)]['name'].tolist()
            if len(m) >= 4:
                actors = random.sample(m, 4)
                if is_cat_valid(actors, "Ivy League", "life", current_idx, subtype="Ivy"):
                    return {"title": "Attended Ivy League", "actors": package_actors(actors), "type": "life", "subtype": "Ivy", "ref": "Ivy League"}
        elif opt == "Birth Year":
            targets = pool['birth_year'].value_counts()[lambda x: x >= 4].index.tolist()
            random.shuffle(targets)
            for y in targets:
                m = pool[pool['birth_year'] == y]['name'].tolist()
                actors = random.sample(m, 4)
                if is_cat_valid(actors, str(y), "life", current_idx, subtype="Birth Year"):
                    return {"title": f"Born in {int(y)}", "actors": package_actors(actors), "type": "life", "subtype": "Birth Year", "ref": str(y)}
        elif opt == "Ambassador":
            brands = list(MANUAL["brand_ambassadors"].keys())
            random.shuffle(brands)
            for b_cat in brands:
                m = [n for n in MANUAL["brand_ambassadors"][b_cat] if n in pool['name'].values]
                if len(m) >= 4:
                    actors = random.sample(m, 4)
                    if is_cat_valid(actors, b_cat, "life", current_idx, subtype="Ambassador"):
                        return {"title": f"{b_cat} Ambassadors", "actors": package_actors(actors), "type": "life", "subtype": "Ambassador", "ref": b_cat}
        elif opt in MANUAL["life_facts"]:
            matches = [n for n in MANUAL["life_facts"][opt] if n in pool['name'].values]
            if len(matches) >= 4:
                actors = random.sample(matches, 4)
                if is_cat_valid(actors, opt, "life", current_idx, subtype=opt):
                    return {"title": opt, "actors": package_actors(actors), "type": "life", "subtype": opt}
    return None

def get_same_tv_cat(pool, current_idx):
    tv_counts = {}
    for _, row in pool.iterrows():
        shows = [s.strip() for s in row['tv_shows'].split('|') if s.strip()]
        for s in shows: tv_counts[s] = tv_counts.get(s, 0) + 1
    potential = [s for s, count in tv_counts.items() if count >= 4]
    random.shuffle(potential)
    for s in potential:
        m = pool[pool['tv_shows'].str.contains(re.escape(s), na=False)]['name'].tolist()
        actors = random.sample(m, 4)
        if is_cat_valid(actors, s, "tv", current_idx):
            return {"title": f"In the TV show '{s}'", "actors": package_actors(actors), "type": "tv", "ref": s}
    return None

# ==========================================
# 4. ENGINE & MEMORY
# ==========================================
class Tracker:
    def __init__(self, movie_window=50):
        self.movie_window = movie_window
        self.movie_history = [] # list of (puzzle_idx, movie_title)
        self.category_usage = {} # {identifier: count}
        self.used_trio_categories = set() # set of (trio, identifier)

    def get_limit(self, cat_type, subtype, identifier):
        if cat_type == "movie": return 1000 # handled by window
        if cat_type == "char": return 5
        if cat_type == "award": return 61
        if cat_type == "performance":
            if subtype == "directorial_muses": return 5
            return 25 # performance_archetypes
        if cat_type == "tv":
            if subtype == "cameos": return 15
            return 25 # same tv show
        if cat_type == "name":
            if identifier == "Alliterative Names": return 32
            if identifier in ["Hyphenated Names", "Three Names"]: return 22
            return 40
        if cat_type == "life":
            if subtype == "Ambassador": return 3
            if subtype in ["Ivy", "Alma Mater"]: return 10
            if subtype in ["Birth Year", "Height", "Birth Place"]: return 50
            return 10 # Fact bucket
        return 5 # Default

    def is_cat_legal(self, actor_names, identifier, cat_type, current_idx, subtype=None):
        # 1. Check Usage Limits
        if cat_type == "movie":
            # Sliding window for movies
            recent_movies = [m for idx, m in self.movie_history if idx > current_idx - self.movie_window]
            if identifier in recent_movies:
                return False
        else:
            limit = self.get_limit(cat_type, subtype, identifier)
            if self.category_usage.get(identifier, 0) >= limit:
                return False

        # 2. Check Trio Repetition
        names = sorted(actor_names)
        for trio in itertools.combinations(names, 3):
            if (trio, identifier) in self.used_trio_categories:
                return False
        return True

    def register(self, puzzle_idx, category):
        identifier = category.get('ref') if category.get('ref') else category['title']
        cat_type = category['type']
        actor_names = [a['name'] for a in category['actors']]

        # Register Category Usage
        if cat_type == "movie":
            self.movie_history.append((puzzle_idx, identifier))
        else:
            self.category_usage[identifier] = self.category_usage.get(identifier, 0) + 1

        # Register Trios
        names = sorted(actor_names)
        for trio in itertools.combinations(names, 3):
            self.used_trio_categories.add((trio, identifier))

tracker = Tracker()

def is_cat_valid(actor_names, identifier, cat_type, current_idx, subtype=None):
    return tracker.is_cat_legal(actor_names, identifier, cat_type, current_idx, subtype)

def add_to_memory(puzzle, puzzle_idx):
    for cat in puzzle:
        tracker.register(puzzle_idx, cat)

def generate_puzzle(puzzle_idx):
    for attempt in range(3000): # Increased attempt limit for robustness
        puzzle = []
        used_names = set()
        used_headers = set() 
        used_life_subtypes = set()
        
        # CATEGORY 1: MOVIE
        rem = df[~df['name'].isin(used_names)]
        c1 = get_same_movie_cat(rem, puzzle_idx) if random.random() < 0.90 else get_aux_movie_cat(rem, puzzle_idx)
        if not c1: continue
        puzzle.append(c1)
        used_names.update([a['name'] for a in c1['actors']])

        # CATEGORY 2 & 3: MEAT
        failed_meat = False
        for _ in range(2):
            rem = df[~df['name'].isin(used_names)]
            roll = random.random()
            if roll < 0.15: h = "awards"
            elif roll < 0.45: h = "life"
            elif roll < 0.60: h = "performance"
            else: h = "name"
            
            if h != "life" and h in used_headers:
                available = list({"awards", "life", "performance", "name"} - used_headers)
                if not available: failed_meat = True; break
                h = random.choice(available)
            
            res = None
            if h == "awards": res = get_awards_cat(rem, puzzle_idx)
            elif h == "life": res = get_life_cat(rem, used_life_subtypes, puzzle_idx)
            elif h == "performance": res = get_performance_cat(rem, puzzle_idx)
            elif h == "name": res = get_name_cat(rem, puzzle_idx)
            
            if res:
                puzzle.append(res)
                used_names.update([a['name'] for a in res['actors']])
                used_headers.add(h)
                if h == "life": used_life_subtypes.add(res['subtype'])
            else:
                failed_meat = True; break
        
        if failed_meat: continue

        # CATEGORY 4: WILDCARD
        rem = df[~df['name'].isin(used_names)]
        w_roll = random.random()
        c4 = None
        if w_roll < 0.6: # Meat
            available = list({"awards", "life", "performance", "name"} - used_headers)
            if "life" not in available: available.append("life")
            random.shuffle(available)
            for h in available:
                if h == "awards": c4 = get_awards_cat(rem, puzzle_idx)
                elif h == "life": c4 = get_life_cat(rem, used_life_subtypes, puzzle_idx)
                elif h == "performance": c4 = get_performance_cat(rem, puzzle_idx)
                elif h == "name": c4 = get_name_cat(rem, puzzle_idx)
                if c4: break
        elif w_roll < 0.8: # Movie
            c4 = get_same_movie_cat(rem, puzzle_idx)
        else: # TV
            c4 = get_same_tv_cat(rem, puzzle_idx)
            
        if c4:
            puzzle.append(c4)
            if len(puzzle) == 4:
                add_to_memory(puzzle, puzzle_idx)
                return puzzle
    return None
            
# ==========================================
# 5. EXECUTION
# ==========================================
    
def run_batch(count):
    all_puzzles = []
    print(f"🚀 Generating {count} puzzles...")
    
    # Using while loop to ensure we don't quit until we have the full batch
    while len(all_puzzles) < count:
        idx = len(all_puzzles)
        p = generate_puzzle(idx)
        if p:
            all_puzzles.append(p)
            if len(all_puzzles) % 20 == 0:
                print(f"  [{len(all_puzzles)}/{count}]...")
                with open('jsons/puzzle_batch.json', 'w') as f: 
                    json.dump(all_puzzles, f, indent=4)
        else:
            print("  ⚠️ Bottleneck hit. Relaxing constraints or retrying...")

    with open('jsons/puzzle_batch.json', 'w') as f: 
        json.dump(all_puzzles, f, indent=4)
    print(f"✅ Saved {len(all_puzzles)} puzzles.")

if __name__ == "__main__":
    run_batch(730)