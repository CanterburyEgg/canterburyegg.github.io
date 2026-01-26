import pandas as pd

# Load the universe
df = pd.read_csv('lists/actor_universe.csv')

# Sort strictly by the TMDB popularity column
# Assuming your column is exactly 'popularity'
df_sorted = df.sort_values(by='popularity', ascending=False)

# Take the top 500
top_600 = df_sorted.head(600)

# Save it so we have a static file to work with
top_600.to_csv('lists/top_600_popular.csv', index=False)

print("Top 600 by Popularity:")
print(top_600[['name', 'popularity']].head(20))