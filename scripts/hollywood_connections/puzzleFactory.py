import pandas as pd
import random
import json
import re
from itertools import combinations

# ==========================================
# 1. SETUP & DATA LOADING
# ==========================================
df = pd.read_csv('lists/top_600_stripped.csv')
top_movies_df = pd.read_csv('lists/top_movies.csv')
TOP_MOVIES_LIST = set(top_movies_df['title'].tolist())

# Ensure profile_path is treated as a string and handles NaNs
df['profile_path'] = df['profile_path'].fillna('')

manual = {
    "played_same_character": {
        "Sherlock Holmes": ["Robert Downey Jr.", "Benedict Cumberbatch", "Henry Cavill", "Ian McKellen", "Jonny Lee Miller", "Will Ferrell"],
        "The Joker": ["Heath Ledger", "Joaquin Phoenix", "Jack Nicholson", "Jared Leto", "Barry Keoghan"],
        "Batman": ["Christian Bale", "Robert Pattinson", "Ben Affleck", "Michael Keaton", "George Clooney", "Val Kilmer"],
        "Elvis Presley": ["Austin Butler", "Jacob Elordi", "Kurt Russell", "Jonathan Rhys Meyers", "Michael Shannon"],
        "James Bond": ["Daniel Craig", "Pierce Brosnan", "Roger Moore", "Sean Connery", "Timothy Dalton", "George Lazenby"],
        "The Hulk": ["Mark Ruffalo", "Edward Norton", "Eric Bana", "Lou Ferrigno"],
        "Robin Hood": ["Taron Egerton", "Russell Crowe", "Kevin Costner", "Cary Elwes", "Sean Connery"],
        "Jack Ryan": ["John Krasinski", "Chris Pine", "Ben Affleck", "Harrison Ford", "Alec Baldwin"]
    },
    "awards_and_honors": {
        "People's Sexiest Man Alive": ["Adam Levine", "Ben Affleck", "Blake Shelton", "Brad Pitt", "Bradley Cooper", "Channing Tatum", "Chris Evans", "Chris Hemsworth", "David Beckham", "Denzel Washington", "Dwayne Johnson", "George Clooney", "Harrison Ford", "Harry Hamlin", "Heath Ledger", "Hugh Jackman", "Idris Elba", "John F. Kennedy Jr.", "John Krasinski", "John Legend", "Johnny Depp", "Jonathan Bailey", "Jude Law", "Keanu Reeves", "Mark Harmon", "Matt Damon", "Matthew McConaughey", "Mel Gibson", "Michael B. Jordan", "Nick Nolte", "Patrick Dempsey", "Patrick Swayze", "Paul Rudd", "Pierce Brosnan", "Richard Gere", "Husband", "Ryan Reynolds", "Sean Connery", "Tom Cruise"],
        "People's Most Beautiful": ["Angelina Jolie", "Beyoncé", "Catherine Zeta-Jones", "Chrissy Teigen", "Christina Applegate", "Cindy Crawford", "Courteney Cox", "Demi Moore", "Drew Barrymore", "Goldie Hawn", "Gwyneth Paltrow", "Halle Berry", "Helen Mirren", "Jennifer Aniston", "Jennifer Garner", "Jennifer Lopez", "Jodie Foster", "Julia Roberts", "Kate Hudson", "Leonardo DiCaprio", "Lupita Nyong'o", "Meg Ryan", "Mel Gibson", "Melissa McCarthy", "Michelle Pfeiffer", "Nicole Kidman", "Pink", "Sandra Bullock", "Sofía Vergara", "Tom Cruise"],
        "Best Actor Winners": ["Adrien Brody", "Al Pacino", "Anthony Hopkins", "Art Carney", "Ben Kingsley", "Bing Crosby", "Brendan Fraser", "Broderick Crawford", "Burt Lancaster", "Casey Affleck", "Charles Laughton", "Charlton Heston", "Christopher Plummer", "Cillian Murphy", "Clark Gable", "Cliff Robertson", "Colin Firth", "Daniel Day-Lewis", "Dustin Hoffman", "Eddie Redmayne", "Ernest Borgnine", "F. Murray Abraham", "Forest Whitaker", "Fredric March", "Gary Cooper", "Gary Oldman", "Gene Hackman", "Geoffrey Rush", "George Arliss", "George C. Scott", "Gregory Peck", "Humphrey Bogart", "Jack Lemmon", "Jack Nicholson", "James Cagney", "James Stewart", "Jamie Foxx", "Jean Dujardin", "Jeff Bridges", "Jeremy Irons", "Joaquin Phoenix", "John Wayne", "Jon Voight", "José Ferrer", "Kevin Spacey", "Laurence Olivier", "Lee Marvin", "Leonardo DiCaprio", "Lionel Barrymore", "Marlon Brando", "Matthew McConaughey", "Maximilian Schell", "Michael Douglas", "Nicolas Cage", "Paul Lucas", "Paul Muni", "Paul Newman", "Paul Scofield", "Peter Finch", "Philip Seymour Hoffman", "Rami Malek", "Ray Milland", "Richard Dreyfuss", "Robert De Niro", "Robert Donat", "Robert Duvall", "Roberto Benigni", "Rod Steiger", "Ronald Colman", "Russell Crowe", "Sean Penn", "Sidney Poitier", "Spencer Tracy", "Tom Hanks", "Vicente Minnelli", "Victor McLaglen", "Warner Baxter", "Will Smith", "William Holden", "William Hurt", "Yul Brunner"],
        "Best Actress Winners": ["Anne Bancroft", "Audrey Hepburn", "Barlbara Stanwyck", "Bette Davis", "Brie Larson", "Cate Blanchett", "Charlize Theron", "Cher", "Claudette Colbert", "Diane Keaton", "Elizabeth Taylor", "Ellen Burstyn", "Emma Stone", "Emma Thompson", "Faye Dunaway", "Frances McDormand", "Geraldine Page", "Glenda Jackson", "Grace Kelly", "Gwyneth Paltrow", "Halle Berry", "Helen Hunt", "Helen Mirren", "Hilary Swank", "Holly Hunter", "Ingrid Bergman", "Jane Fonda", "Janet Gaynor", "Jennifer Lawrence", "Jessica Chastain", "Jessica Lange", "Jessica Tandy", "Joan Crawford", "Joan Fontaine", "Jodie Foster", "Judy Holliday", "Julie Andrews", "Julie Christie", "Julia Roberts", "Julianne Moore", "Kate Winslet", "Katharine Hepburn", "Liza Nikki", "Loretta Young", "Louise Fletcher", "Maggie Smith", "Marie Dressler", "Marion Cotillard", "Mary Pickford", "Meryl Streep", "Michelle Yeoh", "Mikey Madison", "Natalie Portman", "Nicole Kidman", "Olivia Colman", "Olivia de Havilland", "Patricia Neal", "Reese Witherspoon", "Renée Zellweger", "Sally Field", "Sandra Bullock", "Shirley Booth", "Shirley MacLaine", "Simone Signoret", "Sissy Spacek", "Susan Hayward", "Susan Sarandon", "Vivien Leigh"],
        "Best Supporting Actor Winners": ["Alan Arkin", "Anthony Quinn", "Barry Fitzgerald", "Benicio del Toro", "Burl Ives", "Charles Coburn", "Chris Cooper", "Christian Bale", "Christoph Waltz", "Christopher Plummer", "Christopher Walken", "Cuba Gooding Jr.", "Daniel Kaluuya", "Dean Jagger", "Denzel Washington", "Don Ameche", "Donald Crisp", "Ed Begley", "Edmond O'Brien", "Edmund Gwenn", "Frank Sinatra", "George Chakiris", "George Clooney", "George Kennedy", "George Sanders", "Haing S. Ngor", "Harold Russell", "Heath Ledger", "Hugh Griffith", "J.K. Simmons", "Jack Albertson", "Jack Lemmon", "Jack Nicholson", "Jack Palance", "James Coburn", "Jared Leto", "Jason Robards", "Javier Bardem", "Jim Broadbent", "Joe Pesci", "Joel Grey", "John Gielgud", "John Houseman", "John Mills", "Joseph Schildkraut", "Karl Malden", "Ke Huy Quan", "Kevin Kline", "Kevin Spacey", "Kieran Culkin", "Louis Gossett Jr.", "Mahershala Ali", "Mark Rylance", "Martin Balsam", "Martin Landau", "Melvyn Douglas", "Michael Caine", "Morgan Freeman", "Peter Ustinov", "Red Buttons", "Robert De Niro", "Robert Downey Jr.", "Robin Williams", "Sam Rockwell", "Sean Connery", "Thomas Mitchell", "Tim Robbins", "Timothy Hutton", "Tommy Lee Jones", "Troy Kotsur", "Van Heflin", "Walter Brennan", "Walter Huston", "Walter Matthau"],
        "Best Supporting Actress Winners": ["Alicia Vikander", "Alice Brady", "Allison Janney", "Angelina Jolie", "Anna Paquin", "Anne Baxter", "Anne Hathaway", "Anne Revere", "Anjelica Huston", "Ariana DeBose", "Beatrice Straight", "Brenda Fricker", "Cate Blanchett", "Catherine Zeta-Jones", "Celeste Holm", "Cloris Leachman", "Claire Trevor", "Da'Vine Joy Randolph", "Dianne Wiest", "Donna Reed", "Dorothy Malone", "Eileen Heckart", "Estelle Parsons", "Ethel Barrymore", "Eva Marie Saint", "Fay Bainter", "Gale Sondergaard", "Geena Davis", "Gloria Grahame", "Goldie Hawn", "Hattie McDaniel", "Helen Hayes", "Ingrid Bergman", "Jamie Lee Curtis", "Jane Darwell", "Jennifer Connelly", "Jennifer Hudson", "Jessica Lange", "Jo Van Fleet", "Josephine Hull", "Judi Dench", "Juliette Binoche", "Katina Paxinou", "Kim Basinger", "Kim Hunter", "Laura Dern", "Lee Grant", "Linda Hunt", "Lupita Nyong'o", "Maggie Smith", "Marcia Gay Harden", "Marisa Tomei", "Mary Astor", "Mary Steenburgen", "Maureen Stapleton", "Melissa Leo", "Mercedes McCambridge", "Mercedes Ruehl", "Meryl Streep", "Mira Sorvino", "Miyoshi Umeki", "Mo'Nique", "Octavia Spencer", "Olympia Dukakis", "Patricia Arquette", "Peggy Ashcroft", "Penélope Cruz", "Rachel Weisz", "Regina King", "Renée Zellweger", "Rita Moreno", "Ruth Gordon", "Sandy Dennis", "Shelley Winters", "Tatum O'Neal", "Teresa Wright", "Tilda Swinton", "Vanessa Redgrave", "Viola Davis", "Wendy Hiller", "Whoopi Goldberg", "Yuh-Jung Youn", "Zoe Saldaña"]
    }
}

RESTRICTED_KEYWORDS = {
    "Colors": {"Black", "Brown", "Green", "Grey", "White", "Silver", "Gold", "Berry"},
    "Animals": {"Bear", "Bull", "Drake", "Fox", "Hawk", "Lamb", "Phoenix", "Wolf", "Crabb"},
    "Occupations": {"Baker", "Butler", "Cook", "Fisher", "Gardner", "Miller", "Page", "Smith", "Taylor", "Potter"},
    "Royalty": {"King", "Knight", "Prince", "Duke", "Earl", "Baron", "Lord", "Queen", "Major"},
    "Nature": {"Wood", "Stone", "Hill", "Lake", "River", "Field", "Bush", "Marsh", "Forest"},
    "Weather": {"Snow", "Rain", "Storm", "Gale", "Frost", "Cloud", "Sunny", "Wind"},
    "Directions": {"North", "West", "East", "South", "Southern"},
    "Measurements": {"Little", "Short", "Long", "Small", "Biggs", "Miles", "Inch"}
}

# ==========================================
# 2. GLOBAL MEMORY
# ==========================================
class GlobalMemory:
    def __init__(self, movie_window=50):
        self.used_trios = set()
        self.movie_history = [] 
        self.movie_window = movie_window

    def is_movie_legal(self, movie_title, current_idx):
        recent = [m for idx, m in self.movie_history if idx > current_idx - self.movie_window]
        return movie_title not in recent

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
        matches = pool[pool['name'].isin(manual["played_same_character"][s])]['name'].tolist()
        if len(matches) >= 4:
            selection_names = random.sample(matches, 4)
            title = f"All played {s}"
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
        selection_names = random.sample(places[target], 4)
        title = f"Born in {target}"
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
            sel = pool[pool['first_name'] == t]['name'].tolist()
            names = random.sample(sel, 4)
            title = "Same first name"
            if tracker.is_trio_legal(names, title):
                return {"title": title, "actors": package_actors(pool, names), "type": "name"}
    elif mode == 'initials':
        v = pool['initials'].value_counts()
        valid = v[v >= 4].index.tolist()
        if valid:
            t = random.choice(valid)
            sel = pool[pool['initials'] == t]['name'].tolist()
            names = random.sample(sel, 4)
            title = "Same initials"
            if tracker.is_trio_legal(names, title):
                return {"title": title, "actors": package_actors(pool, names), "type": "name"}
    elif mode == 'specialty':
        special_mode = random.choice(['alliterative', 'three names', 'hyphenated'])
    
        if special_mode == 'alliterative':
            mask = pool['first_name'].str[0].str.lower() == pool['last_name'].str[0].str.lower()
            matches = pool[mask]['name'].tolist()
            if len(matches) >= 4:
                names = random.sample(matches, 4)
                title = "Alliterative Names"
                if tracker.is_trio_legal(names, title):
                    return {"title": title, "actors": package_actors(pool, names), "type": "name"}
        elif special_mode == 'three names':
            matches = pool[
                (pool['name'].str.split().str.len() == 3) & 
                (~pool['name'].str.contains(r'\.'))
            ]['name'].tolist()
            if len(matches) >= 4:
                names = random.sample(matches, 4)
                title = "Actors Known by Three Names"
                if tracker.is_trio_legal(names, title):
                    return {"title": title, "actors": package_actors(pool, names), "type": "name"}
        elif special_mode == 'hyphenated':
            matches = pool[pool['name'].str.contains('-', na=False)]['name'].tolist()
            if len(matches) >= 4:
                names = random.sample(matches, 4)
                title = "Hyphenated Last Names"
                if tracker.is_trio_legal(names, title):
                    return {"title": title, "actors": package_actors(pool, names), "type": "name"}

    return None

def get_year_cat(pool):
    v = pool['birth_year'].value_counts()
    valid = v[v >= 4].index.tolist()
    if not valid: return None
    t = random.choice(valid)
    sel = pool[pool['birth_year'] == t]['name'].tolist()
    names = random.sample(sel, 4)
    title = f"Born in {int(t)}"
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