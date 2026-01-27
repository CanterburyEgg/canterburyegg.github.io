import pandas as pd
import random
import json
import re
from itertools import combinations

# ==========================================
# 1. SETUP & DATA LOADING
# ==========================================
df = pd.read_csv('lists/top_600_enriched.csv')
top_movies_df = pd.read_csv('lists/top_movies.csv')
TOP_MOVIES_LIST = set(top_movies_df['title'].tolist())

# Ensure profile_path is treated as a string and handles NaNs
df['profile_path'] = df['profile_path'].fillna('')

manual = {
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
        "Nepo Babies": ["Bryce Dallas Howard", "Dakota Johnson", "Drew Barrymore", "Emma Roberts", "Gwyneth Paltrow", "Jack Quaid", "Jamie Lee Curtis", "John David Washington", "Kate Hudson", "Lily-Rose Depp", "Maya Hawke", "Zoë Kravitz"],
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
        }
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
# 2. GLOBAL MEMORY
# ==========================================
class GlobalMemory:
    def __init__(self, movie_window=50):
        self.used_trios = set()
        self.movie_history = [] 
        self.movie_window = movie_window
        self.category_usage = {}

    def is_movie_legal(self, movie_title, current_idx):
        recent = [m for idx, m in self.movie_history if idx > current_idx - self.movie_window]
        return movie_title not in recent

    def is_category_legal(self, category_title):
        return self.category_usage.get(category_title, 0) < 10

    def is_trio_legal(self, actors, category_title):
        names = sorted([a['name'] if isinstance(a, dict) else a for a in actors])
        for trio in combinations(names, 3):
            # Same trio is only illegal if it's paired with the same category title
            if (trio, category_title) in self.used_trios:
                return False
        return True

    def register(self, actors, puzzle_idx, category_title, movie_title=None):
        names = sorted([a['name'] if isinstance(a, dict) else a for a in actors])
        for trio in combinations(names, 3):
            self.used_trios.add((trio, category_title))
        if movie_title:
            self.movie_history.append((puzzle_idx, movie_title))
        else:
            self.category_usage[category_title] = self.category_usage.get(category_title, 0) + 1

tracker = GlobalMemory(movie_window=50)

# ==========================================
# 3. HELPER: DATA PACKAGER
# ==========================================
def package_actors(df_pool, name_list):
    matches = df_pool[df_pool['name'].isin(name_list)]
    return matches[['name', 'profile_path']].to_dict('records')

# ==========================================
# 4. CATEGORY FUNCTIONS
# ==========================================

def get_movie_cat(pool, current_idx):
    movie_counts = {}
    shuffled_pool = pool.sample(frac=1)
    for _, row in shuffled_pool.iterrows():
        if pd.isna(row['movie_credits']): continue
        for m in row['movie_credits'].split('|'):
            if m in TOP_MOVIES_LIST:
                movie_counts[m] = movie_counts.get(m, []) + [row['name']]
    
    valid_movies = [m for m, names in movie_counts.items() 
                    if len(names) >= 4 and tracker.is_movie_legal(m, current_idx)]
    
    random.shuffle(valid_movies)
    for target in valid_movies:
        potential_actors = movie_counts[target]
        title = f"In the movie '{target}'"
        for _ in range(10):
            selection_names = random.sample(potential_actors, 4)
            if tracker.is_trio_legal(selection_names, title):
                return {
                    "title": title, 
                    "actors": package_actors(pool, selection_names), 
                    "type": "movie", "ref": target
                }
    return None

def get_award_cat(pool):
    subcats = [s for s in manual["awards_and_honors"].keys() if "Winner" in s]
    random.shuffle(subcats)
    for s in subcats:
        if not tracker.is_category_legal(s): continue
        matches = pool[pool['name'].isin(manual["awards_and_honors"][s])]['name'].tolist()
        if len(matches) >= 4:
            selection_names = random.sample(matches, 4)
            if tracker.is_trio_legal(selection_names, s):
                return {"title": s, "actors": package_actors(pool, selection_names), "type": "award"}
    return None

def get_char_cat(pool):
    subcats = list(manual["played_same_character"].keys())
    random.shuffle(subcats)
    for s in subcats:
        title = f"All played {s}"
        if not tracker.is_category_legal(title): continue
        matches = pool[pool['name'].isin(manual["played_same_character"][s])]['name'].tolist()
        if len(matches) >= 4:
            selection_names = random.sample(matches, 4)
            if tracker.is_trio_legal(selection_names, title):
                return {"title": title, "actors": package_actors(pool, selection_names), "type": "char"}
    return None

def get_place_cat(pool):
    places = {}
    for _, row in pool.iterrows():
        if pd.isna(row['birth_place']): continue
        parts = [p.strip() for p in row['birth_place'].split(',')]
        key = parts[-2] if (len(parts) >= 3 and parts[-1] == "USA") else parts[-1]
        places[key] = places.get(key, []) + [row['name']]
    
    valid = [k for k, v in places.items() if len(v) >= 4]
    random.shuffle(valid)
    for target in valid:
        title = f"Born in {target}"
        if not tracker.is_category_legal(title): continue
        selection_names = random.sample(places[target], 4)
        if tracker.is_trio_legal(selection_names, title):
            return {"title": title, "actors": package_actors(pool, selection_names), "type": "place"}
    return None

def get_name_cat(pool):
    mode = random.choice(['first', 'initials', 'specialty'])
    if mode == 'first':
        v = pool['first_name'].value_counts()
        valid = v[v >= 4].index.tolist()
        if valid:
            t = random.choice(valid)
            title = f"First Name: {t}"
            if not tracker.is_category_legal(title): return None
            sel = pool[pool['first_name'] == t]['name'].tolist()
            names = random.sample(sel, 4)
            if tracker.is_trio_legal(names, title):
                return {"title": title, "actors": package_actors(pool, names), "type": "name"}
    elif mode == 'initials':
        v = pool['initials'].value_counts()
        valid = v[v >= 4].index.tolist()
        if valid:
            t = random.choice(valid)
            title = f"Initials: {t}"
            if not tracker.is_category_legal(title): return None
            sel = pool[pool['initials'] == t]['name'].tolist()
            names = random.sample(sel, 4)
            if tracker.is_trio_legal(names, title):
                return {"title": title, "actors": package_actors(pool, names), "type": "name"}
    elif mode == 'specialty':
        special_mode = random.choice(['alliterative', 'three names', 'hyphenated'])
    
        if special_mode == 'alliterative':
            title = "Alliterative Names"
            if not tracker.is_category_legal(title): return None
            mask = pool['first_name'].str[0].str.lower() == pool['last_name'].str[0].str.lower()
            matches = pool[mask]['name'].tolist()
            if len(matches) >= 4:
                names = random.sample(matches, 4)
                if tracker.is_trio_legal(names, title):
                    return {"title": title, "actors": package_actors(pool, names), "type": "name"}
        elif special_mode == 'three names':
            title = "Actors Known by Three Names"
            if not tracker.is_category_legal(title): return None
            matches = pool[
                (pool['name'].str.split().str.len() == 3) & 
                (~pool['name'].str.contains(r'\.'))
            ]['name'].tolist()
            if len(matches) >= 4:
                names = random.sample(matches, 4)
                if tracker.is_trio_legal(names, title):
                    return {"title": title, "actors": package_actors(pool, names), "type": "name"}
        elif special_mode == 'hyphenated':
            title = "Hyphenated Last Names"
            if not tracker.is_category_legal(title): return None
            matches = pool[pool['name'].str.contains('-', na=False)]['name'].tolist()
            if len(matches) >= 4:
                names = random.sample(matches, 4)
                if tracker.is_trio_legal(names, title):
                    return {"title": title, "actors": package_actors(pool, names), "type": "name"}

    return None

def get_year_cat(pool):
    v = pool['birth_year'].value_counts()
    valid = v[v >= 4].index.tolist()
    if not valid: return None
    t = random.choice(valid)
    title = f"Born in {int(t)}"
    if not tracker.is_category_legal(title): return None
    sel = pool[pool['birth_year'] == t]['name'].tolist()
    names = random.sample(sel, 4)
    if tracker.is_trio_legal(names, title):
        return {"title": title, "actors": package_actors(pool, names), "type": "year"}
    return None

def get_restricted_cat(pool):
    options = list(RESTRICTED_KEYWORDS.keys()) + ["Ivy", "Sexiest", "Beautiful"]
    random.shuffle(options)
    
    for choice in options:
        if choice == "Ivy":
            matches = pool[pool['is_ivy'] == True]
            title = "Ivy Leaguers"
        elif choice in RESTRICTED_KEYWORDS:
            matches = pool[pool['last_name'].isin(RESTRICTED_KEYWORDS[choice])]
            title = f"{choice} Names"
        elif choice == "Sexiest":
            matches = pool[pool['name'].isin(manual["awards_and_honors"]["People's Sexiest Man Alive"])]
            title = "People's Sexiest Man Alive"
        else:
            matches = pool[pool['name'].isin(manual["awards_and_honors"]["People's Most Beautiful"])]
            title = "People's Most Beautiful"

        if not tracker.is_category_legal(title): continue

        if len(matches) >= 4:
            unique_surname_pool = matches.groupby('last_name').head(1)['name'].tolist()
            if len(unique_surname_pool) >= 4:
                selection_names = random.sample(unique_surname_pool, 4)
                if tracker.is_trio_legal(selection_names, title):
                    return {"title": title, "actors": package_actors(pool, selection_names), "type": "restricted"}
    return None

# ==========================================
# 5. MASTER ENGINE
# ==========================================

def generate_puzzle(p_idx):
    attempts = 0
    while attempts < 3000:
        puzzle = []
        used_names = set()
        
        # CATEGORY 1: MANDATORY MOVIE
        cat1 = get_movie_cat(df, p_idx)
        if not cat1: attempts += 1; continue
        puzzle.append(cat1)
        used_names.update([a['name'] for a in cat1['actors']])

        # MOVIE WRAPPER
        def movie_func(p): return get_movie_cat(p, p_idx)
        movie_func.__name__ = "get_movie_cat"

        # CATEGORIES 2 & 3: NO MOVIES ALLOWED HERE
        main_logic = [get_award_cat, get_char_cat, get_name_cat, get_year_cat, get_place_cat]
        random.shuffle(main_logic)

        for func in main_logic:
            if len(puzzle) >= 3: break
            rem = df[~df['name'].isin(used_names)]
            res = func(rem)
            if res:
                # Strictly unique types for cat 2 and 3
                current_types = [p['type'] for p in puzzle]
                if res['type'] not in current_types:
                    puzzle.append(res)
                    used_names.update([a['name'] for a in res['actors']])

        # CATEGORY 4: MOVIE AND RESTRICTED POOL
        if len(puzzle) == 3:
            rem = df[~df['name'].isin(used_names)]
            cat4 = None
            
            # 33% chance to pick from Restricted OR a second movie
            if random.random() < 0.33:
                # Combine restricted and movie function for the special slot
                special_pool = [get_restricted_cat, movie_func]
                random.shuffle(special_pool)
                for f in special_pool:
                    cat4 = f(rem)
                    if cat4: break
            
            # If 33% roll failed or function returned None, pick from general logic
            if not cat4:
                current_types = [p['type'] for p in puzzle]
                final_pool = [f for f in main_logic if f.__name__ != "movie_func"]
                random.shuffle(final_pool)
                for f in final_pool:
                    res = f(rem)
                    if res and (res['type'] not in current_types):
                        cat4 = res; break

            if cat4:
                puzzle.append(cat4)
                all_actor_names = [actor['name'] for p in puzzle for actor in p['actors']]
                if len(set(all_actor_names)) == 16:
                    for p in puzzle:
                        tracker.register(p['actors'], p_idx, p['title'], movie_title=p.get('ref'))
                    return puzzle
                else:
                    puzzle.pop() 

        attempts += 1
    return None

# EXECUTION
batch_size = 730
all_puzzles = []
for i in range(batch_size):
    puzzle = generate_puzzle(i)
    if puzzle:
        all_puzzles.append(puzzle)
        if (i+1) % 10 == 0: print(f"Progress: {i+1}/{batch_size}")
    else:
        print(f"FAILED at puzzle {i+1}.")
        break

with open('jsons/puzzle_batch.json', 'w') as f:
    json.dump(all_puzzles, f, indent=4)