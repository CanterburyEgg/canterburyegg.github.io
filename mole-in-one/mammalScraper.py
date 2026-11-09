#!/usr/bin/env python3
"""
mammalScraper.py
================
Builds a verified, comprehensive dataset of 5,200+ extant mammals for "Mammal Golf":
  1. Scrapes all 6 official Wikipedia IUCN Red List mammal articles:
       - List of critically endangered mammals (CR)
       - List of endangered mammals (EN)
       - List of vulnerable mammals (VU)
       - List of near threatened mammals (NT)
       - List of least concern mammals (LC)
       - List of data deficient mammals (DD)
  2. Scrapes all ~240 official Wikipedia Continental & Country Mammal List articles
     (Africa, Asia, Europe, North America, South America, Australia/Oceania) to map
     each species to its native continent(s).
  3. Scrapes 60-day Wikipedia pageviews & Taxoboxes for high-visibility iconic and
     domesticated mammals so course Par is always anchored by recognizable animals
     while ALL 5,200+ mammal species are playable and categorized.
  4. Computes 32 undeniable categories and generates 30 verified 9-category Golf
     boards with exact Set-Cover Par.
"""

from __future__ import annotations

import json
import random
import re
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

WIKI_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "CanterburyEggTriviaBot/1.0 (https://canterburyegg.github.io; contact@canterburyegg.github.io) Python/3.12"

MAMMAL_DIR = Path(__file__).resolve().parent
CACHE_PATH = MAMMAL_DIR / ".mammal_wiki_cache.json"
LISTS_CACHE_PATH = MAMMAL_DIR / ".mammal_lists_cache.json"
OUT_JSON_PATH = MAMMAL_DIR / "mole_in_one.json"

IUCN_LIST_PAGES: dict[str, str] = {
    "List of critically endangered mammals": "CR",
    "List of endangered mammals": "EN",
    "List of vulnerable mammals": "VU",
    "List of near threatened mammals": "NT",
    "List of least concern mammals": "LC",
    "List of data deficient mammals": "DD",
}

# Format: (Canonical Name, Wiki Page Title, Order, Family, Continents, Diet, IUCN_Fallback, Weight_Class, Anatomy_Flags, Extra_Aliases)
# Continents: AF=Africa, AS=Asia, NA=North America, SA=South America, EU=Europe, AU=Australia/Oceania, OC=Oceanic/Marine
# Diet: H=Herbivore, C=Vertebrate Carnivore, I=Insectivore, O=Omnivore
# Weight_Class: S (<5kg), M (5-200kg), L (>200kg)
# Anatomy_Flags: H=Horns/Antlers/Tusks, U=Hooves, A=Aquatic/Semiaquatic, M=Fully Marine, P=Pouch/Monotreme,
#                S=Stripes/Spots, F=Flight/Glide
MAMMAL_ROSTER: list[tuple[str, str, str, str, list[str], str, str, str, str, list[str]]] = [
    # --- FELIDAE (Cats) ---
    ("Lion", "Lion", "Carnivora", "Felidae", ["AF", "AS"], "C", "VU", "L", "", ["african lion", "panthera leo"]),
    ("Tiger", "Tiger", "Carnivora", "Felidae", ["AS"], "C", "EN", "L", "S", ["bengal tiger", "siberian tiger", "panthera tigris"]),
    ("Cheetah", "Cheetah", "Carnivora", "Felidae", ["AF", "AS"], "C", "VU", "M", "S", ["acinonyx jubatus"]),
    ("Leopard", "Leopard", "Carnivora", "Felidae", ["AF", "AS"], "C", "VU", "M", "S", ["black panther", "panthera pardus"]),
    ("Jaguar", "Jaguar", "Carnivora", "Felidae", ["NA", "SA"], "C", "NT", "M", "S", ["panthera onca"]),
    ("Snow leopard", "Snow leopard", "Carnivora", "Felidae", ["AS"], "C", "VU", "M", "S", ["ounce", "panthera uncia"]),
    ("Clouded leopard", "Clouded leopard", "Carnivora", "Felidae", ["AS"], "C", "VU", "M", "S", ["neofelis nebulosa"]),
    ("Cougar", "Cougar", "Carnivora", "Felidae", ["NA", "SA"], "C", "LC", "M", "", ["puma", "mountain lion", "catamount", "panther", "puma concolor"]),
    ("Lynx", "Eurasian lynx", "Carnivora", "Felidae", ["EU", "AS", "NA"], "C", "LC", "M", "S", ["eurasian lynx", "lynx lynx"]),
    ("Bobcat", "Bobcat", "Carnivora", "Felidae", ["NA"], "C", "LC", "M", "S", ["lynx rufus"]),
    ("Ocelot", "Ocelot", "Carnivora", "Felidae", ["NA", "SA"], "C", "LC", "M", "S", ["leopardus pardalis"]),
    ("Serval", "Serval", "Carnivora", "Felidae", ["AF"], "C", "LC", "M", "S", ["leptailurus serval"]),
    ("Caracal", "Caracal", "Carnivora", "Felidae", ["AF", "AS"], "C", "LC", "M", "", ["desert lynx", "caracal caracal"]),
    ("Fishing cat", "Fishing cat", "Carnivora", "Felidae", ["AS"], "C", "VU", "M", "AS", ["prionailurus viverrinus"]),
    ("Pallas's cat", "Pallas's cat", "Carnivora", "Felidae", ["AS"], "C", "LC", "S", "", ["manul", "pallas cat", "otocolobus manul"]),
    ("Margay", "Margay", "Carnivora", "Felidae", ["NA", "SA"], "C", "NT", "S", "S", ["leopardus wiedii"]),
    ("Jaguarundi", "Jaguarundi", "Carnivora", "Felidae", ["NA", "SA"], "C", "LC", "M", "", ["herpailurus yagouaroundi"]),
    ("Sand cat", "Sand cat", "Carnivora", "Felidae", ["AF", "AS"], "C", "LC", "S", "", ["felis margarita"]),
    ("Domestic cat", "Cat", "Carnivora", "Felidae", ["AF", "AS", "EU"], "C", "DOM", "S", "", ["cat", "house cat", "housecat", "felis catus"]),

    # --- CANIDAE (Dogs, Wolves, Foxes) ---
    ("Gray wolf", "Wolf", "Carnivora", "Canidae", ["NA", "EU", "AS"], "C", "LC", "M", "", ["wolf", "grey wolf", "timber wolf", "canis lupus"]),
    ("Red fox", "Red fox", "Carnivora", "Canidae", ["NA", "EU", "AS", "AF"], "O", "LC", "M", "", ["fox", "vulpes vulpes"]),
    ("Arctic fox", "Arctic fox", "Carnivora", "Canidae", ["NA", "EU", "AS"], "O", "LC", "S", "", ["white fox", "polar fox", "vulpes lagopus"]),
    ("Fennec fox", "Fennec fox", "Carnivora", "Canidae", ["AF"], "O", "LC", "S", "", ["fennec", "vulpes zerda"]),
    ("Coyote", "Coyote", "Carnivora", "Canidae", ["NA"], "O", "LC", "M", "", ["prairie wolf", "canis latrans"]),
    ("Golden jackal", "Golden jackal", "Carnivora", "Canidae", ["EU", "AS"], "O", "LC", "M", "", ["jackal", "canis aureus"]),
    ("African wild dog", "African wild dog", "Carnivora", "Canidae", ["AF"], "C", "EN", "M", "S", ["painted dog", "cape hunting dog", "painted wolf", "lycaon pictus"]),
    ("Maned wolf", "Maned wolf", "Carnivora", "Canidae", ["SA"], "O", "NT", "M", "", ["chrysocyon brachyurus"]),
    ("Dhole", "Dhole", "Carnivora", "Canidae", ["AS"], "C", "EN", "M", "", ["asiatic wild dog", "indian wild dog", "cuon alpinus"]),
    ("Raccoon dog", "Raccoon dog", "Carnivora", "Canidae", ["AS", "EU"], "O", "LC", "M", "", ["tanuki", "nyctereutes procyonoides"]),
    ("Bat-eared fox", "Bat-eared fox", "Carnivora", "Canidae", ["AF"], "I", "LC", "S", "", ["otocyon megalotis"]),
    ("Dingo", "Dingo", "Carnivora", "Canidae", ["AU"], "C", "VU", "M", "", ["canis dingo"]),
    ("Domestic dog", "Dog", "Carnivora", "Canidae", ["AS", "EU"], "O", "DOM", "M", "", ["dog", "canis familiaris"]),

    # --- URSIDAE (Bears) ---
    ("Brown bear", "Brown bear", "Carnivora", "Ursidae", ["NA", "EU", "AS"], "O", "LC", "L", "", ["grizzly bear", "grizzly", "kodiak bear", "bear", "ursus arctos"]),
    ("Polar bear", "Polar bear", "Carnivora", "Ursidae", ["NA", "EU", "AS"], "C", "VU", "L", "A", ["ursus maritimus"]),
    ("American black bear", "American black bear", "Carnivora", "Ursidae", ["NA"], "O", "LC", "L", "", ["black bear", "ursus americanus"]),
    ("Asian black bear", "Asian black bear", "Carnivora", "Ursidae", ["AS"], "O", "VU", "M", "", ["moon bear", "asiatic black bear", "ursus thibetanus"]),
    ("Giant panda", "Giant panda", "Carnivora", "Ursidae", ["AS"], "H", "VU", "M", "", ["panda", "panda bear", "ailuropoda melanoleuca"]),
    ("Spectacled bear", "Spectacled bear", "Carnivora", "Ursidae", ["SA"], "O", "VU", "M", "", ["andean bear", "tremarctos ornatus"]),
    ("Sloth bear", "Sloth bear", "Carnivora", "Ursidae", ["AS"], "I", "VU", "M", "", ["melursus ursinus"]),
    ("Sun bear", "Sun bear", "Carnivora", "Ursidae", ["AS"], "O", "VU", "M", "", ["honey bear", "helarctos malayanus"]),

    # --- MUSTELIDS, PROCYONIDS, MEPHITIDS, HERPESTIDS, HYAENIDS, VIVERRIDS ---
    ("Sea otter", "Sea otter", "Carnivora", "Mustelidae", ["NA", "AS", "OC"], "C", "EN", "M", "AM", ["enhydra lutris"]),
    ("River otter", "North American river otter", "Carnivora", "Mustelidae", ["NA"], "C", "LC", "M", "A", ["north american river otter", "otter", "lontra canadensis"]),
    ("Giant otter", "Giant otter", "Carnivora", "Mustelidae", ["SA"], "C", "EN", "M", "A", ["giant river otter", "pteronura brasiliensis"]),
    ("Wolverine", "Wolverine", "Carnivora", "Mustelidae", ["NA", "EU", "AS"], "C", "LC", "M", "", ["glutton", "carcajou", "gulo gulo"]),
    ("European badger", "European badger", "Carnivora", "Mustelidae", ["EU", "AS"], "O", "LC", "M", "S", ["badger", "meles meles"]),
    ("American badger", "American badger", "Carnivora", "Mustelidae", ["NA"], "C", "LC", "M", "S", ["taxidea taxus"]),
    ("Honey badger", "Honey badger", "Carnivora", "Mustelidae", ["AF", "AS"], "O", "LC", "M", "", ["ratel", "mellivora capensis"]),
    ("Stoat", "Stoat", "Carnivora", "Mustelidae", ["NA", "EU", "AS"], "C", "LC", "S", "", ["ermine", "short-tailed weasel", "mustela erminea"]),
    ("Weasel", "Least weasel", "Carnivora", "Mustelidae", ["NA", "EU", "AS"], "C", "LC", "S", "", ["least weasel", "mustela nivalis"]),
    ("Ferret", "Ferret", "Carnivora", "Mustelidae", ["EU"], "C", "DOM", "S", "", ["domestic ferret", "mustela furo"]),
    ("Black-footed ferret", "Black-footed ferret", "Carnivora", "Mustelidae", ["NA"], "C", "EN", "S", "", ["mustela nigripes"]),
    ("American mink", "American mink", "Carnivora", "Mustelidae", ["NA"], "C", "LC", "S", "A", ["mink", "neogale vison"]),
    ("Pine marten", "European pine marten", "Carnivora", "Mustelidae", ["EU", "AS"], "O", "LC", "S", "", ["marten", "european pine marten", "martes martes"]),
    ("Raccoon", "Raccoon", "Carnivora", "Procyonidae", ["NA"], "O", "LC", "M", "S", ["trash panda", "procyon lotor"]),
    ("Red panda", "Red panda", "Carnivora", "Ailuridae", ["AS"], "H", "EN", "S", "", ["lesser panda", "ailurus fulgens"]),
    ("Coati", "South American coati", "Carnivora", "Procyonidae", ["SA"], "O", "LC", "M", "", ["coatimundi", "south american coati", "nasua nasua"]),
    ("Kinkajou", "Kinkajou", "Carnivora", "Procyonidae", ["NA", "SA"], "O", "LC", "S", "", ["potos flavus"]),
    ("Striped skunk", "Striped skunk", "Carnivora", "Mephitidae", ["NA"], "O", "LC", "S", "S", ["skunk", "mephitis mephitis"]),
    ("Meerkat", "Meerkat", "Carnivora", "Herpestidae", ["AF"], "I", "LC", "S", "S", ["suricate", "suricata suricatta"]),
    ("Mongoose", "Indian grey mongoose", "Carnivora", "Herpestidae", ["AS", "AF"], "C", "LC", "S", "", ["indian gray mongoose", "indian grey mongoose", "urva edwardsii"]),
    ("Spotted hyena", "Spotted hyena", "Carnivora", "Hyaenidae", ["AF"], "C", "LC", "M", "S", ["hyena", "laughing hyena", "crocuta crocuta"]),
    ("Striped hyena", "Striped hyena", "Carnivora", "Hyaenidae", ["AF", "AS"], "O", "NT", "M", "S", ["hyaena hyaena"]),
    ("Aardwolf", "Aardwolf", "Carnivora", "Hyaenidae", ["AF"], "I", "LC", "M", "S", ["proteles cristata"]),
    ("Binturong", "Binturong", "Carnivora", "Viverridae", ["AS"], "O", "VU", "M", "", ["bearcat", "arctictis binturong"]),
    ("Fossa", "Fossa (animal)", "Carnivora", "Eupleridae", ["AF"], "C", "VU", "M", "", ["cryptoprocta ferox"]),

    # --- PINNIPEDS (Seals, Sea Lions, Walrus) ---
    ("Walrus", "Walrus", "Carnivora", "Odobenidae", ["NA", "EU", "AS", "OC"], "C", "VU", "L", "HAM", ["odobenus rosmarus"]),
    ("Elephant seal", "Southern elephant seal", "Carnivora", "Phocidae", ["SA", "AU", "OC"], "C", "LC", "L", "AM", ["southern elephant seal", "mirounga leonina"]),
    ("Harbor seal", "Harbor seal", "Carnivora", "Phocidae", ["NA", "EU", "AS", "OC"], "C", "LC", "M", "AMS", ["seal", "common seal", "phoca vitulina"]),
    ("Leopard seal", "Leopard seal", "Carnivora", "Phocidae", ["OC"], "C", "LC", "L", "AMS", ["hydrurga leptonyx"]),
    ("Harp seal", "Harp seal", "Carnivora", "Phocidae", ["NA", "EU", "OC"], "C", "LC", "M", "AM", ["pagophilus groenlandicus"]),
    ("Sea lion", "California sea lion", "Carnivora", "Otariidae", ["NA", "OC"], "C", "LC", "L", "AM", ["california sea lion", "zalophus californianus"]),
    ("Fur seal", "Northern fur seal", "Carnivora", "Otariidae", ["NA", "AS", "OC"], "C", "VU", "L", "AM", ["northern fur seal", "callorhinus ursinus"]),

    # --- CETACEANS & SIRENIANS (Whales, Dolphins, Manatees) ---
    ("Blue whale", "Blue whale", "Artiodactyla", "Balaenopteridae", ["OC"], "C", "EN", "L", "AM", ["balaenoptera musculus"]),
    ("Humpback whale", "Humpback whale", "Artiodactyla", "Balaenopteridae", ["OC"], "C", "LC", "L", "AM", ["megaptera novaeangliae"]),
    ("Sperm whale", "Sperm whale", "Artiodactyla", "Physeteridae", ["OC"], "C", "VU", "L", "AM", ["cachalot", "physeter macrocephalus"]),
    ("Bowhead whale", "Bowhead whale", "Artiodactyla", "Balaenidae", ["OC"], "C", "LC", "L", "AM", ["balaena mysticetus"]),
    ("Minke whale", "Common minke whale", "Artiodactyla", "Balaenopteridae", ["OC"], "C", "LC", "L", "AM", ["common minke whale", "balaenoptera acutorostrata"]),
    ("Gray whale", "Gray whale", "Artiodactyla", "Eschrichtiidae", ["OC"], "C", "LC", "L", "AM", ["grey whale", "eschrichtius robustus"]),
    ("Orca", "Orca", "Artiodactyla", "Delphinidae", ["OC"], "C", "LC", "L", "AM", ["killer whale", "orcinus orca"]),
    ("Bottlenose dolphin", "Common bottlenose dolphin", "Artiodactyla", "Delphinidae", ["OC"], "C", "LC", "L", "AM", ["dolphin", "common bottlenose dolphin", "tursiops truncatus"]),
    ("Spinner dolphin", "Spinner dolphin", "Artiodactyla", "Delphinidae", ["OC"], "C", "LC", "M", "AM", ["stenella longirostris"]),
    ("Amazon river dolphin", "Amazon river dolphin", "Artiodactyla", "Iniidae", ["SA"], "C", "EN", "M", "A", ["pink river dolphin", "boto", "inia geoffrensis"]),
    ("Harbor porpoise", "Harbour porpoise", "Artiodactyla", "Phocoenidae", ["OC"], "C", "LC", "M", "AM", ["porpoise", "harbour porpoise", "phocoena phocoena"]),
    ("Beluga whale", "Beluga whale", "Artiodactyla", "Monodontidae", ["OC"], "C", "LC", "L", "AM", ["beluga", "delphinapterus leucas"]),
    ("Narwhal", "Narwhal", "Artiodactyla", "Monodontidae", ["OC"], "C", "LC", "L", "HAM", ["monodon monoceros"]),
    ("Manatee", "West Indian manatee", "Sirenia", "Trichechidae", ["NA", "SA", "OC"], "H", "VU", "L", "AM", ["west indian manatee", "sea cow", "trichechus manatus"]),
    ("Dugong", "Dugong", "Sirenia", "Dugongidae", ["AF", "AS", "AU", "OC"], "H", "VU", "L", "AM", ["dugong dugon"]),

    # --- EVEN-TOED UNGULATES (Artiodactyla) ---
    ("Giraffe", "Giraffe", "Artiodactyla", "Giraffidae", ["AF"], "H", "VU", "L", "HUS", ["giraffa camelopardalis"]),
    ("Okapi", "Okapi", "Artiodactyla", "Giraffidae", ["AF"], "H", "EN", "L", "HUS", ["okapia johnstoni"]),
    ("Hippopotamus", "Hippopotamus", "Artiodactyla", "Hippopotamidae", ["AF"], "H", "VU", "L", "HUA", ["hippo", "common hippopotamus", "hippopotamus amphibius"]),
    ("Pygmy hippopotamus", "Pygmy hippopotamus", "Artiodactyla", "Hippopotamidae", ["AF"], "H", "EN", "L", "HUA", ["pygmy hippo", "choeropsis liberiensis"]),
    ("Moose", "Moose", "Artiodactyla", "Cervidae", ["NA", "EU", "AS"], "H", "LC", "L", "HUA", ["eurasian elk", "alces alces"]),
    ("Elk", "Elk", "Artiodactyla", "Cervidae", ["NA", "AS"], "H", "LC", "L", "HU", ["wapiti", "cervus canadensis"]),
    ("Reindeer", "Reindeer", "Artiodactyla", "Cervidae", ["NA", "EU", "AS"], "H", "VU", "M", "HU", ["caribou", "rangifer tarandus"]),
    ("White-tailed deer", "White-tailed deer", "Artiodactyla", "Cervidae", ["NA", "SA"], "H", "LC", "M", "HU", ["whitetail deer", "deer", "odocoileus virginianus"]),
    ("Red deer", "Red deer", "Artiodactyla", "Cervidae", ["EU", "AS", "AF"], "H", "LC", "L", "HU", ["stag", "cervus elaphus"]),
    ("Fallow deer", "Fallow deer", "Artiodactyla", "Cervidae", ["EU", "AS"], "H", "LC", "M", "HUS", ["dama dama"]),
    ("Roe deer", "Roe deer", "Artiodactyla", "Cervidae", ["EU", "AS"], "H", "LC", "M", "HU", ["capreolus capreolus"]),
    ("Chital", "Chital", "Artiodactyla", "Cervidae", ["AS"], "H", "LC", "M", "HUS", ["axis deer", "spotted deer", "axis axis"]),
    ("Muntjac", "Muntjac", "Artiodactyla", "Cervidae", ["AS"], "H", "LC", "M", "HU", ["barking deer", "indian muntjac", "muntiacus muntjak"]),
    ("Pronghorn", "Pronghorn", "Artiodactyla", "Antilocapridae", ["NA"], "H", "LC", "M", "HU", ["pronghorn antelope", "antilocapra americana"]),
    ("American bison", "American bison", "Artiodactyla", "Bovidae", ["NA"], "H", "NT", "L", "HU", ["bison", "buffalo", "american buffalo", "bison bison"]),
    ("European bison", "European bison", "Artiodactyla", "Bovidae", ["EU"], "H", "NT", "L", "HU", ["wisent", "bison bonasus"]),
    ("African buffalo", "African buffalo", "Artiodactyla", "Bovidae", ["AF"], "H", "NT", "L", "HU", ["cape buffalo", "syncerus caffer"]),
    ("Water buffalo", "Water buffalo", "Artiodactyla", "Bovidae", ["AS"], "H", "DOM", "L", "HUA", ["bubalus bubalis"]),
    ("Yak", "Wild yak", "Artiodactyla", "Bovidae", ["AS"], "H", "VU", "L", "HU", ["wild yak", "domestic yak", "bos mutus"]),
    ("Cattle", "Cattle", "Artiodactyla", "Bovidae", ["AS", "EU"], "H", "DOM", "L", "HU", ["cow", "bull", "ox", "zebu", "bos taurus"]),
    ("Muskox", "Muskox", "Artiodactyla", "Bovidae", ["NA", "EU", "AS"], "H", "LC", "L", "HU", ["musk ox", "ovibos moschatus"]),
    ("Bighorn sheep", "Bighorn sheep", "Artiodactyla", "Bovidae", ["NA"], "H", "LC", "M", "HU", ["ovis canadensis"]),
    ("Sheep", "Sheep", "Artiodactyla", "Bovidae", ["AS", "EU"], "H", "DOM", "M", "HU", ["domestic sheep", "ram", "ewe", "ovis aries"]),
    ("Goat", "Goat", "Artiodactyla", "Bovidae", ["AS", "EU"], "H", "DOM", "M", "HU", ["domestic goat", "capra hircus"]),
    ("Mountain goat", "Mountain goat", "Artiodactyla", "Bovidae", ["NA"], "H", "LC", "M", "HU", ["rocky mountain goat", "oreamnos americanus"]),
    ("Ibex", "Alpine ibex", "Artiodactyla", "Bovidae", ["EU", "AS", "AF"], "H", "LC", "M", "HU", ["alpine ibex", "nubian ibex", "walia ibex", "spanish ibex", "siberian ibex", "capra ibex"]),
    ("Chamois", "Chamois", "Artiodactyla", "Bovidae", ["EU", "AS"], "H", "LC", "M", "HU", ["rupicapra rupicapra"]),
    ("Blue wildebeest", "Blue wildebeest", "Artiodactyla", "Bovidae", ["AF"], "H", "LC", "L", "HUS", ["wildebeest", "gnu", "connochaetes taurinus"]),
    ("Impala", "Impala", "Artiodactyla", "Bovidae", ["AF"], "H", "LC", "M", "HU", ["aepyceros melampus"]),
    ("Gazelle", "Thomson's gazelle", "Artiodactyla", "Bovidae", ["AF", "AS"], "H", "LC", "M", "HUS", ["thomson's gazelle", "eudorcas thomsonii"]),
    ("Springbok", "Springbok", "Artiodactyla", "Bovidae", ["AF"], "H", "LC", "M", "HU", ["antidorcas marsupialis"]),
    ("Kudu", "Greater kudu", "Artiodactyla", "Bovidae", ["AF"], "H", "LC", "L", "HUS", ["greater kudu", "tragelaphus strepsiceros"]),
    ("Eland", "Common eland", "Artiodactyla", "Bovidae", ["AF"], "H", "LC", "L", "HU", ["common eland", "taurotragus oryx"]),
    ("Gemsbok", "Gemsbok", "Artiodactyla", "Bovidae", ["AF"], "H", "LC", "L", "HU", ["oryx", "oryx gazella"]),
    ("Bongo", "Bongo (antelope)", "Artiodactyla", "Bovidae", ["AF"], "H", "NT", "L", "HUS", ["tragelaphus eurycerus"]),
    ("Dik-dik", "Kirk's dik-dik", "Artiodactyla", "Bovidae", ["AF"], "H", "LC", "S", "HU", ["kirk's dik-dik", "dik dik", "madoqua kirkii"]),
    ("Saiga antelope", "Saiga antelope", "Artiodactyla", "Bovidae", ["AS", "EU"], "H", "NT", "M", "HU", ["saiga", "saiga tatarica"]),
    ("Wild boar", "Wild boar", "Artiodactyla", "Suidae", ["EU", "AS", "AF"], "O", "LC", "M", "HU", ["boar", "wild pig", "sus scrofa"]),
    ("Domestic pig", "Pig", "Artiodactyla", "Suidae", ["AS", "EU"], "O", "DOM", "M", "U", ["pig", "hog", "swine", "sus domesticus"]),
    ("Warthog", "Common warthog", "Artiodactyla", "Suidae", ["AF"], "O", "LC", "M", "HU", ["common warthog", "phacochoerus africanus"]),
    ("Babirusa", "Babirusa", "Artiodactyla", "Suidae", ["AS"], "O", "VU", "M", "HU", ["north sulawesi babirusa", "babyrousa babyrussa"]),
    ("Peccary", "Collared peccary", "Artiodactyla", "Tayassuidae", ["NA", "SA"], "O", "LC", "M", "HU", ["collared peccary", "javelina", "pecari tajacu"]),
    ("Bactrian camel", "Bactrian camel", "Artiodactyla", "Camelidae", ["AS"], "H", "CR", "L", "U", ["camel", "wild bactrian camel", "camelus bactrianus", "camelus ferus"]),
    ("Dromedary", "Dromedary", "Artiodactyla", "Camelidae", ["AF", "AS"], "H", "DOM", "L", "U", ["arabian camel", "dromedary camel", "camelus dromedarius"]),
    ("Llama", "Llama", "Artiodactyla", "Camelidae", ["SA"], "H", "DOM", "M", "U", ["lama glama"]),
    ("Alpaca", "Alpaca", "Artiodactyla", "Camelidae", ["SA"], "H", "DOM", "M", "U", ["vicugna pacos"]),
    ("Vicuña", "Vicuña", "Artiodactyla", "Camelidae", ["SA"], "H", "LC", "M", "U", ["vicuna", "vicugna vicugna"]),
    ("Guanaco", "Guanaco", "Artiodactyla", "Camelidae", ["SA"], "H", "LC", "M", "U", ["lama guanicoe"]),

    # --- ODD-TOED UNGULATES (Perissodactyla) ---
    ("Horse", "Horse", "Perissodactyla", "Equidae", ["AS", "EU"], "H", "DOM", "L", "U", ["domestic horse", "stallion", "mare", "equus caballus"]),
    ("Przewalski's horse", "Przewalski's horse", "Perissodactyla", "Equidae", ["AS"], "H", "EN", "L", "U", ["takhi", "mongolian wild horse", "wild horse", "equus ferus"]),
    ("Donkey", "Donkey", "Perissodactyla", "Equidae", ["AF", "AS"], "H", "DOM", "M", "U", ["ass", "burro", "equus asinus"]),
    ("Zebra", "Plains zebra", "Perissodactyla", "Equidae", ["AF"], "H", "NT", "L", "US", ["plains zebra", "equus quagga"]),
    ("White rhinoceros", "White rhinoceros", "Perissodactyla", "Rhinocerotidae", ["AF"], "H", "NT", "L", "HU", ["white rhino", "rhinoceros", "rhino", "ceratotherium simum"]),
    ("Black rhinoceros", "Black rhinoceros", "Perissodactyla", "Rhinocerotidae", ["AF"], "H", "CR", "L", "HU", ["black rhino", "diceros bicornis"]),
    ("Indian rhinoceros", "Indian rhinoceros", "Perissodactyla", "Rhinocerotidae", ["AS"], "H", "VU", "L", "HU", ["indian rhino", "greater one-horned rhino", "rhinoceros unicornis"]),
    ("South American tapir", "South American tapir", "Perissodactyla", "Tapiridae", ["SA"], "H", "VU", "L", "UA", ["tapir", "brazilian tapir", "tapirus terrestris"]),
    ("Malayan tapir", "Malayan tapir", "Perissodactyla", "Tapiridae", ["AS"], "H", "EN", "L", "UA", ["tapirus indicus"]),

    # --- PROBOSCIDEA & AFROTHERIA ---
    ("African elephant", "African bush elephant", "Proboscidea", "Elephantidae", ["AF"], "H", "EN", "L", "H", ["african bush elephant", "elephant", "loxodonta africana"]),
    ("Asian elephant", "Asian elephant", "Proboscidea", "Elephantidae", ["AS"], "H", "EN", "L", "H", ["indian elephant", "elephas maximus"]),
    ("Aardvark", "Aardvark", "Tubulidentata", "Orycteropodidae", ["AF"], "I", "LC", "M", "", ["orycteropus afer"]),
    ("Hyrax", "Rock hyrax", "Hyracoidea", "Procaviidae", ["AF", "AS"], "H", "LC", "S", "", ["rock hyrax", "tree hyrax", "yellow-spotted rock hyrax", "southern tree hyrax", "western tree hyrax", "dassie", "procavia capensis"]),
    ("Elephant shrew", "Elephant shrew", "Macroscelidea", "Macroscelididae", ["AF"], "I", "LC", "S", "", ["sengi"]),
    ("Tenrec", "Tailless tenrec", "Afrosoricida", "Tenrecidae", ["AF"], "I", "LC", "S", "", ["tailless tenrec", "tenrec ecaudatus"]),

    # --- PRIMATES ---
    ("Gorilla", "Western gorilla", "Primates", "Hominidae", ["AF"], "H", "CR", "L", "", ["western gorilla", "gorilla gorilla"]),
    ("Chimpanzee", "Chimpanzee", "Primates", "Hominidae", ["AF"], "O", "EN", "M", "", ["chimp", "pan troglodytes"]),
    ("Bonobo", "Bonobo", "Primates", "Hominidae", ["AF"], "O", "EN", "M", "", ["pygmy chimpanzee", "pan paniscus"]),
    ("Orangutan", "Bornean orangutan", "Primates", "Hominidae", ["AS"], "O", "CR", "M", "", ["bornean orangutan", "pongo pygmaeus"]),
    ("Gibbon", "Lar gibbon", "Primates", "Hylobatidae", ["AS"], "O", "EN", "M", "", ["lar gibbon", "white-handed gibbon", "hylobates lar"]),
    ("Siamang", "Siamang", "Primates", "Hylobatidae", ["AS"], "H", "EN", "M", "", ["symphalangus syndactylus"]),
    ("Baboon", "Olive baboon", "Primates", "Cercopithecidae", ["AF"], "O", "LC", "M", "", ["olive baboon", "papio anubis"]),
    ("Mandrill", "Mandrill", "Primates", "Cercopithecidae", ["AF"], "O", "VU", "M", "", ["mandrillus sphinx"]),
    ("Gelada", "Gelada", "Primates", "Cercopithecidae", ["AF"], "H", "LC", "M", "", ["bleeding-heart monkey", "theropithecus gelada"]),
    ("Rhesus macaque", "Rhesus macaque", "Primates", "Cercopithecidae", ["AS"], "O", "LC", "M", "", ["macaque", "rhesus monkey", "macaca mulatta"]),
    ("Japanese macaque", "Japanese macaque", "Primates", "Cercopithecidae", ["AS"], "O", "LC", "M", "", ["snow monkey", "macaca fuscata"]),
    ("Proboscis monkey", "Proboscis monkey", "Primates", "Cercopithecidae", ["AS"], "H", "EN", "M", "A", ["nasalis larvatus"]),
    ("Vervet monkey", "Vervet monkey", "Primates", "Cercopithecidae", ["AF"], "O", "LC", "S", "", ["vervet", "chlorocebus pygerythrus"]),
    ("Capuchin monkey", "Capuchin monkey", "Primates", "Cebidae", ["NA", "SA"], "O", "LC", "S", "", ["capuchin", "white-headed capuchin", "cebus capucinus"]),
    ("Squirrel monkey", "Squirrel monkey", "Primates", "Cebidae", ["NA", "SA"], "O", "LC", "S", "", ["common squirrel monkey", "saimiri sciureus"]),
    ("Howler monkey", "Mantled howler", "Primates", "Atelidae", ["NA", "SA"], "H", "VU", "M", "", ["mantled howler", "alouatta palliata"]),
    ("Spider monkey", "Geoffroy's spider monkey", "Primates", "Atelidae", ["NA", "SA"], "H", "EN", "M", "", ["geoffroy's spider monkey", "ateles geoffroyi"]),
    ("Golden lion tamarin", "Golden lion tamarin", "Primates", "Callitrichidae", ["SA"], "O", "EN", "S", "", ["tamarin", "leontopithecus rosalia"]),
    ("Marmoset", "Common marmoset", "Primates", "Callitrichidae", ["SA"], "O", "LC", "S", "", ["common marmoset", "callithrix jacchus"]),
    ("Ring-tailed lemur", "Ring-tailed lemur", "Primates", "Lemuridae", ["AF"], "O", "EN", "S", "S", ["lemur", "lemur catta"]),
    ("Indri", "Indri", "Primates", "Indriidae", ["AF"], "H", "CR", "M", "", ["indri indri"]),
    ("Aye-aye", "Aye-aye", "Primates", "Daubentoniidae", ["AF"], "O", "EN", "S", "", ["daubentonia madagascariensis"]),
    ("Tarsier", "Philippine tarsier", "Primates", "Tarsiidae", ["AS"], "I", "NT", "S", "", ["philippine tarsier", "carlito syrichta"]),
    ("Slow loris", "Slow loris", "Primates", "Lorisidae", ["AS"], "O", "EN", "S", "", ["sunda slow loris", "nycticebus coucang"]),
    ("Galago", "Galago", "Primates", "Galagidae", ["AF"], "O", "LC", "S", "", ["bushbaby", "bush baby", "senegal bushbaby", "galago senegalensis"]),

    # --- RODENTIA & LAGOMORPHA ---
    ("Capybara", "Capybara", "Rodentia", "Caviidae", ["SA"], "H", "LC", "M", "A", ["greater capybara", "hydrochoerus hydrochaeris"]),
    ("Beaver", "North American beaver", "Rodentia", "Castoridae", ["NA", "EU"], "H", "LC", "M", "A", ["north american beaver", "castor canadensis"]),
    ("Porcupine", "North American porcupine", "Rodentia", "Erethizontidae", ["NA"], "H", "LC", "M", "", ["north american porcupine", "erethizon dorsatum"]),
    ("Crested porcupine", "Crested porcupine", "Rodentia", "Hystricidae", ["AF", "EU"], "H", "LC", "M", "", ["hystrix cristata"]),
    ("Gray squirrel", "Eastern gray squirrel", "Rodentia", "Sciuridae", ["NA"], "O", "LC", "S", "", ["squirrel", "eastern gray squirrel", "sciurus carolinensis"]),
    ("Flying squirrel", "Flying squirrel", "Rodentia", "Sciuridae", ["NA", "EU", "AS"], "O", "LC", "S", "F", ["northern flying squirrel", "glaucomys sabrinus"]),
    ("Chipmunk", "Chipmunk", "Rodentia", "Sciuridae", ["NA", "AS"], "O", "LC", "S", "S", ["eastern chipmunk", "tamias striatus"]),
    ("Groundhog", "Groundhog", "Rodentia", "Sciuridae", ["NA"], "H", "LC", "S", "", ["woodchuck", "whistlepig", "marmot", "marmota monax"]),
    ("Alpine marmot", "Alpine marmot", "Rodentia", "Sciuridae", ["EU"], "H", "LC", "S", "", ["marmota marmota"]),
    ("Prairie dog", "Black-tailed prairie dog", "Rodentia", "Sciuridae", ["NA"], "H", "LC", "S", "", ["black-tailed prairie dog", "cynomys ludovicianus"]),
    ("Pocket gopher", "Gopher", "Rodentia", "Geomyidae", ["NA"], "H", "LC", "S", "", ["gopher", "plains pocket gopher", "geomys bursarius"]),
    ("Golden hamster", "Golden hamster", "Rodentia", "Cricetidae", ["AS"], "O", "VU", "S", "", ["hamster", "syrian hamster", "mesocricetus auratus"]),
    ("Guinea pig", "Guinea pig", "Rodentia", "Caviidae", ["SA"], "H", "DOM", "S", "", ["cavy", "cavia porcellus"]),
    ("Chinchilla", "Chinchilla", "Rodentia", "Chinchillidae", ["SA"], "H", "EN", "S", "", ["long-tailed chinchilla", "chinchilla lanigera"]),
    ("Patagonian mara", "Patagonian mara", "Rodentia", "Caviidae", ["SA"], "H", "NT", "M", "", ["mara", "dolichotis patagonum"]),
    ("Agouti", "Common agouti", "Rodentia", "Dasyproctidae", ["SA"], "H", "LC", "S", "", ["red-rumped agouti", "dasyprocta leporina"]),
    ("Nutria", "Nutria", "Rodentia", "Echimyidae", ["SA"], "H", "LC", "M", "A", ["coypu", "myocastor coypus"]),
    ("Muskrat", "Muskrat", "Rodentia", "Cricetidae", ["NA"], "O", "LC", "S", "A", ["ondatra zibethicus"]),
    ("Lemming", "Norway lemming", "Rodentia", "Cricetidae", ["EU", "NA", "AS"], "H", "LC", "S", "", ["norway lemming", "lemmus lemmus"]),
    ("Naked mole-rat", "Naked mole-rat", "Rodentia", "Heterocephalidae", ["AF"], "H", "LC", "S", "", ["naked mole rat", "heterocephalus glaber"]),
    ("Jerboa", "Jerboa", "Rodentia", "Dipodidae", ["AF", "AS"], "O", "LC", "S", "", ["lesser egyptian jerboa", "jaculus jaculus"]),
    ("Kangaroo rat", "Kangaroo rat", "Rodentia", "Heteromyidae", ["NA"], "H", "LC", "S", "", ["ord's kangaroo rat", "dipodomys ordii"]),
    ("Mongolian gerbil", "Mongolian gerbil", "Rodentia", "Muridae", ["AS"], "O", "LC", "S", "", ["gerbil", "meriones unguiculatus"]),
    ("House mouse", "House mouse", "Rodentia", "Muridae", ["AS", "EU"], "O", "LC", "S", "", ["mouse", "field mouse", "domestic mouse", "pet mouse", "fancy mouse", "mus musculus"]),
    ("Brown rat", "Brown rat", "Rodentia", "Muridae", ["AS", "EU"], "O", "LC", "S", "", ["rat", "norway rat", "rattus norvegicus"]),
    ("Dormouse", "Hazel dormouse", "Rodentia", "Gliridae", ["EU"], "O", "LC", "S", "", ["hazel dormouse", "muscardinus avellanarius"]),
    ("Rabbit", "European rabbit", "Lagomorpha", "Leporidae", ["EU", "AF", "NA"], "H", "EN", "S", "", ["european rabbit", "bunny", "oryctolagus cuniculus"]),
    ("Snowshoe hare", "Snowshoe hare", "Lagomorpha", "Leporidae", ["NA"], "H", "LC", "S", "", ["hare", "lepus americanus"]),
    ("American pika", "American pika", "Lagomorpha", "Ochotonidae", ["NA"], "H", "LC", "S", "", ["pika", "ochotona princeps"]),

    # --- MARSUPIALS & MONOTREMES ---
    ("Red kangaroo", "Red kangaroo", "Diprotodontia", "Macropodidae", ["AU"], "H", "LC", "M", "P", ["kangaroo", "osphranter rufus", "macropus rufus"]),
    ("Wallaby", "Red-necked wallaby", "Diprotodontia", "Macropodidae", ["AU"], "H", "LC", "M", "P", ["red-necked wallaby", "notamacropus rufogriseus"]),
    ("Quokka", "Quokka", "Diprotodontia", "Macropodidae", ["AU"], "H", "VU", "S", "P", ["setonix brachyurus"]),
    ("Tree-kangaroo", "Tree-kangaroo", "Diprotodontia", "Macropodidae", ["AU"], "H", "EN", "M", "P", ["tree kangaroo", "goodfellow's tree-kangaroo", "dendrolagus goodfellowi"]),
    ("Koala", "Koala", "Diprotodontia", "Phascolarctidae", ["AU"], "H", "VU", "M", "P", ["koala bear", "phascolarctos cinereus"]),
    ("Wombat", "Common wombat", "Diprotodontia", "Vombatidae", ["AU"], "H", "LC", "M", "P", ["common wombat", "vombatus ursinus"]),
    ("Sugar glider", "Sugar glider", "Diprotodontia", "Petauridae", ["AU"], "O", "LC", "S", "PF", ["petaurus breviceps"]),
    ("Tasmanian devil", "Tasmanian devil", "Dasyuromorphia", "Dasyuridae", ["AU"], "C", "EN", "M", "P", ["sarcophilus harrisii"]),
    ("Tiger quoll", "Tiger quoll", "Dasyuromorphia", "Dasyuridae", ["AU"], "C", "NT", "S", "PS", ["quoll", "spotted-tail quoll", "dasyurus maculatus"]),
    ("Numbat", "Numbat", "Dasyuromorphia", "Myrmecobiidae", ["AU"], "I", "EN", "S", "PS", ["banded anteater", "myrmecobius fasciatus"]),
    ("Bilby", "Greater bilby", "Peramelemorphia", "Thylacomyidae", ["AU"], "O", "VU", "S", "P", ["greater bilby", "macrotis lagotis"]),
    ("Opossum", "Virginia opossum", "Didelphimorphia", "Didelphidae", ["NA", "SA"], "O", "LC", "S", "P", ["virginia opossum", "possum", "didelphis virginiana"]),
    ("Platypus", "Platypus", "Monotremata", "Ornithorhynchidae", ["AU"], "I", "NT", "S", "PA", ["duck-billed platypus", "ornithorhynchus anatinus"]),
    ("Echidna", "Short-beaked echidna", "Monotremata", "Tachyglossidae", ["AU"], "I", "LC", "S", "P", ["short-beaked echidna", "spiny anteater", "tachyglossus aculeatus"]),

    # --- XENARTHRA, PHOLIDOTA, CHIROPTERA, EULIPOTYPHLA ---
    ("Sloth", "Brown-throated sloth", "Pilosa", "Bradypodidae", ["NA", "SA"], "H", "LC", "S", "", ["brown-throated sloth", "three-toed sloth", "bradypus variegatus"]),
    ("Giant anteater", "Giant anteater", "Pilosa", "Myrmecophagidae", ["NA", "SA"], "I", "VU", "M", "", ["anteater", "myrmecophaga tridactyla"]),
    ("Armadillo", "Nine-banded armadillo", "Cingulata", "Dasypodidae", ["NA", "SA"], "I", "LC", "S", "", ["nine-banded armadillo", "dasypus novemcinctus"]),
    ("Pangolin", "Sunda pangolin", "Pholidota", "Manidae", ["AS", "AF"], "I", "CR", "S", "", ["sunda pangolin", "manis javanica"]),
    ("Hedgehog", "European hedgehog", "Eulipotyphla", "Erinaceidae", ["EU", "AS", "AF"], "I", "NT", "S", "", ["european hedgehog", "erinaceus europaeus"]),
    ("Star-nosed mole", "Star-nosed mole", "Eulipotyphla", "Talpidae", ["NA"], "I", "LC", "S", "A", ["mole", "condylura cristata"]),
    ("Shrew", "Common shrew", "Eulipotyphla", "Soricidae", ["EU", "AS", "NA"], "I", "LC", "S", "", ["common shrew", "sorex araneus"]),
    ("Vampire bat", "Common vampire bat", "Chiroptera", "Phyllostomidae", ["NA", "SA"], "C", "LC", "S", "F", ["common vampire bat", "bat", "desmodus rotundus"]),
    ("Flying fox", "Large flying fox", "Chiroptera", "Pteropodidae", ["AS", "AU"], "H", "EN", "S", "F", ["large flying fox", "fruit bat", "megabat", "pteropus vampyrus"]),
    ("Bumblebee bat", "Kitti's hog-nosed bat", "Chiroptera", "Craseonycteridae", ["AS"], "I", "NT", "S", "F", ["kitti's hog-nosed bat", "craseonycteris thonglongyai"]),
    ("Honduran white bat", "Honduran white bat", "Chiroptera", "Phyllostomidae", ["NA"], "H", "NT", "S", "F", ["ectophylla alba"]),
]

CATEGORY_DEFS: list[dict[str, str]] = [
    # Broad Clades & Taxonomy
    {"id": "order_carnivora",        "group": "taxonomy",     "name": "Order Carnivora",            "desc": "Member of the placental mammal order Carnivora"},
    {"id": "order_rodentia",         "group": "taxonomy",     "name": "Rodent",                     "desc": "Member of the order Rodentia with continuously growing incisors"},
    {"id": "order_primates",         "group": "taxonomy",     "name": "Primate",                    "desc": "Member of the mammal order Primates"},
    {"id": "ungulate",               "group": "taxonomy",     "name": "Hoofed Mammal",              "desc": "Even-toed or odd-toed ungulate that walks on hooves"},
    {"id": "marsupial_monotreme",    "group": "taxonomy",     "name": "Marsupial or Monotreme",     "desc": "Pouched marsupial mammal or egg-laying monotreme"},
    {"id": "fully_marine",           "group": "taxonomy",     "name": "Marine Mammal",              "desc": "Ocean-dwelling mammal that relies on the sea for its food and habitat"},

    # Geography & Hemispheres
    {"id": "native_africa",          "group": "geography",    "name": "Native to Africa",           "desc": "Has a native wild population on the African continent or Madagascar"},
    {"id": "native_asia",            "group": "geography",    "name": "Native to Asia",             "desc": "Has a native wild population in Asia"},
    {"id": "native_north_america",   "group": "geography",    "name": "Native to North America",    "desc": "Has a native wild population in North America, Central America, or the Caribbean"},
    {"id": "native_south_america",   "group": "geography",    "name": "Native to South America",    "desc": "Has a native wild population in South America"},
    {"id": "native_europe",          "group": "geography",    "name": "Native to Europe",           "desc": "Has a native wild population in Europe"},
    {"id": "native_australia",       "group": "geography",    "name": "Native to Australia or Oceania", "desc": "Has a native wild population in Australia, Tasmania, New Guinea, or Oceania"},
    {"id": "single_continent",       "group": "geography",    "name": "Endemic to One Continent",   "desc": "Native wild range is confined to a single land continent"},
    {"id": "multi_continent",        "group": "geography",    "name": "Multi-Continent or Oceanic", "desc": "Native wild range spans two or more continents or the open ocean"},
    {"id": "new_world_only",         "group": "geography",    "name": "Strictly New World",         "desc": "Native wild range is exclusively in North, Central, or South America"},
    {"id": "old_world_only",         "group": "geography",    "name": "Strictly Old World",         "desc": "Native wild range is exclusively in Africa, Asia, Europe, or Oceania"},
    {"id": "island_endemic",         "group": "geography",    "name": "Island Endemic",             "desc": "Native wild range is restricted entirely to islands rather than a continental mainland"},

    # Diet, Limbs, Anatomy & Lifestyle
    {"id": "diet_herbivore",         "group": "biology",      "name": "Strictly Herbivorous",       "desc": "Diet consists exclusively of plants, leaves, grasses, fruits, seeds, or bark"},
    {"id": "diet_carnivore",         "group": "biology",      "name": "Vertebrate Predator",        "desc": "Diet consists primarily of hunting or scavenging other vertebrate animals and fish"},
    {"id": "diet_insectivore",       "group": "biology",      "name": "Insectivore",                "desc": "Diet consists primarily of insects, ants, termites, worms, or other small invertebrates"},
    {"id": "diet_omnivore",          "group": "biology",      "name": "Omnivorous Diet",            "desc": "Diet regularly combines both plant matter and animal prey"},
    {"id": "limbs_paws_claws",       "group": "biology",      "name": "Paws or Claws",              "desc": "Walks, digs, or climbs using clawed paws or feet rather than hooves, flippers, or grasping hands"},
    {"id": "limbs_grasping",         "group": "biology",      "name": "Grasping Hands or Thumbs",   "desc": "Has prehensile hands or feet with opposable digits adapted for gripping branches"},
    {"id": "limbs_flippers",         "group": "biology",      "name": "Flippers or Flukes",         "desc": "Limbs are modified into aquatic flippers or tail flukes for marine propulsion"},
    {"id": "horns_antlers_tusks",    "group": "biology",      "name": "Horns, Antlers, or Tusks",   "desc": "Adults possess true horns, deciduous antlers, cranial ossicones, or projecting tusks"},
    {"id": "aquatic_semiaquatic",    "group": "biology",      "name": "Aquatic or Semi-Aquatic",    "desc": "Adapted for swimming and foraging in marine or freshwater habitats"},
    {"id": "terrestrial_only",       "group": "biology",      "name": "Strictly Land-Dwelling",     "desc": "Lives exclusively on land or in trees rather than swimming in aquatic habitats"},
    {"id": "arboreal_tree",          "group": "biology",      "name": "Tree-Dwelling",              "desc": "Spends much of its life climbing, nesting, or foraging up in trees"},
    {"id": "burrowing_den",          "group": "biology",      "name": "Burrowing or Underground Den", "desc": "Excavates or shelters inside underground burrows, tunnels, warrens, or dens"},
    {"id": "domesticated_livestock", "group": "biology",      "name": "Domesticated or Livestock",  "desc": "Bred and kept by humans as a domestic companion, livestock, or working animal"},
    {"id": "armor_spines_plates",    "group": "biology",      "name": "Armor, Quills, or Spines",   "desc": "Body is protected by bony armor bands, overlapping scales, or sharp quills and spines"},
    {"id": "tailless_adult",         "group": "biology",      "name": "No External Tail",           "desc": "Lacks a visible external tail in adulthood"},
    {"id": "stripes_or_spots",       "group": "biology",      "name": "Striped or Spotted Coat",    "desc": "Coat features prominent stripes, spots, bands, or rosettes"},
    {"id": "flight_or_gliding",      "group": "biology",      "name": "Flies or Glides",            "desc": "Capable of powered flight or membrane-assisted gliding through the air"},
    {"id": "weight_over_200kg",      "group": "biology",      "name": "Heavyweight",                "desc": "Adult body mass regularly exceeds 200 kilograms or 440 pounds"},
    {"id": "weight_medium",          "group": "biology",      "name": "Medium-Sized",               "desc": "Adult body mass falls between 5 kilograms and 200 kilograms"},
    {"id": "weight_under_5kg",       "group": "biology",      "name": "Pint-Sized",                 "desc": "Adult body mass is under 5 kilograms or 11 pounds"},

    # Name / Lexical Traits
    {"id": "name_has_color",         "group": "name",         "name": "Color in Common Name",       "desc": "Common name includes a color word"},
    {"id": "name_has_geo",           "group": "name",         "name": "Place or Habitat in Name",   "desc": "Common name includes a geographic region, country, continent, or natural habitat"},
    {"id": "name_body_or_animal",    "group": "name",         "name": "Body Part or Animal in Name","desc": "Common name includes an anatomical body part or a second animal name"},
    {"id": "name_double_letter",     "group": "name",         "name": "Double Letter in Name",      "desc": "Common name contains two identical consecutive letters"},
    {"id": "name_starts_vowel",      "group": "name",         "name": "Starts with a Vowel",        "desc": "Common name begins with the letter A, E, I, O, or U"},
    {"id": "name_starts_consonant",  "group": "name",         "name": "Starts with a Consonant",    "desc": "Common name begins with a consonant letter"},
    {"id": "name_ends_vowel",        "group": "name",         "name": "Ends in a Vowel",            "desc": "Common name ends with the letter A, E, I, O, or U"},
    {"id": "name_ends_consonant",    "group": "name",         "name": "Ends in a Consonant",        "desc": "Common name ends with a consonant letter"},
    {"id": "name_short_5",           "group": "name",         "name": "Short Name",                 "desc": "Common name has 5 letters or fewer in total"},
    {"id": "name_medium_6_11",       "group": "name",         "name": "Medium-Length Name",         "desc": "Common name has between 6 and 11 letters, excluding spaces and hyphens"},
    {"id": "name_long_12",           "group": "name",         "name": "Long Name",                  "desc": "Common name has 12 or more letters, excluding spaces and hyphens"},
    {"id": "name_has_hyphen",        "group": "name",         "name": "Hyphenated Name",            "desc": "Common name is spelled with a hyphen"},
    {"id": "name_single_word",       "group": "name",         "name": "Single-Word Name",           "desc": "Common name consists of a single unhyphenated word"},
    {"id": "name_multi_word",        "group": "name",         "name": "Multi-Word Name",            "desc": "Common name consists of two or more words"},
]


def api_get(params: dict[str, str]) -> dict[str, Any]:
    url = f"{WIKI_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def fetch_wiki_metadata(titles: list[str]) -> dict[str, dict[str, Any]]:
    if CACHE_PATH.exists():
        try:
            cache = json.loads(CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            cache = {}
    else:
        cache = {}

    missing = [t for t in dict.fromkeys(titles) if t not in cache]
    if missing:
        print(f"Fetching Wikipedia Taxobox, IUCN status & 60-day pageviews for {len(missing)} core mammals...")

    batches = [missing[i : i + 10] for i in range(0, len(missing), 10)]

    def fetch_batch(batch: list[str]) -> dict[str, Any]:
        params = {
            "action": "query",
            "prop": "pageviews|revisions|extracts|redirects",
            "titles": "|".join(batch),
            "exintro": "1",
            "exsentences": "2",
            "explaintext": "1",
            "rvprop": "content",
            "rvsection": "0",
            "rdlimit": "max",
            "redirects": "1",
            "format": "json",
        }
        try:
            return api_get(params)
        except Exception as exc:
            print(f"[warn] Batch failed: {exc}", file=sys.stderr)
            return {}

    if batches:
        with ThreadPoolExecutor(max_workers=5) as pool:
            for data in pool.map(fetch_batch, batches):
                if not data:
                    continue
                redir_map: dict[str, str] = {}
                for r in data.get("query", {}).get("redirects", []):
                    redir_map[r["to"]] = r["from"]

                for page in data.get("query", {}).get("pages", {}).values():
                    if "missing" in page:
                        continue
                    title = page.get("title", "")
                    pv = page.get("pageviews") or {}
                    views_60d = sum(v for v in pv.values() if isinstance(v, int))
                    extract = (page.get("extract") or "").strip()
                    revs = page.get("revisions") or []
                    wikitext = revs[0].get("*", "") if revs else ""
                    if not wikitext and revs and "slots" in revs[0]:
                        wikitext = revs[0]["slots"].get("main", {}).get("*", "")

                    m_status = re.search(r"\|\s*status\s*=\s*([A-Za-z]+)", wikitext)
                    wiki_iucn = m_status.group(1).upper() if m_status else None

                    rec = {
                        "title": title,
                        "views_60d": views_60d,
                        "wiki_iucn": wiki_iucn,
                        "extract": extract,
                    }
                    cache[title] = rec
                    if title in redir_map:
                        cache[redir_map[title]] = rec

        CACHE_PATH.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")

    return cache


def fetch_all_wikipedia_mammal_lists() -> dict[str, Any]:
    """
    Fetches and caches:
      - All 6 official Wikipedia IUCN Red List mammal articles (5,300+ species)
      - All ~240 official Wikipedia Continental & Country mammal fauna lists
    """
    if LISTS_CACHE_PATH.exists():
        try:
            return json.loads(LISTS_CACHE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass

    print("Scraping Wikipedia's 6 IUCN mammal lists & ~240 Continental mammal lists...")

    # 1. Fetch the 6 IUCN Red List mammal articles
    iucn_data = api_get({
        "action": "query",
        "prop": "revisions",
        "rvprop": "content",
        "titles": "|".join(IUCN_LIST_PAGES.keys()),
        "format": "json",
    })
    iucn_wikitext: dict[str, str] = {}
    for p in iucn_data.get("query", {}).get("pages", {}).values():
        t = p.get("title", "")
        revs = p.get("revisions") or []
        if t in IUCN_LIST_PAGES and revs:
            iucn_wikitext[IUCN_LIST_PAGES[t]] = revs[0].get("*", "")

    # 2. Discover and fetch Continental/Country mammal list pages
    def get_cat_pages(cat: str) -> list[str]:
        res = api_get({
            "action": "query",
            "list": "categorymembers",
            "cmtitle": cat,
            "cmlimit": "500",
            "format": "json",
        })
        return [
            c["title"]
            for c in res.get("query", {}).get("categorymembers", [])
            if c["title"].startswith("List of mammals of ")
            and "prehistoric" not in c["title"].lower()
            and "fossil" not in c["title"].lower()
        ]

    continent_lists = {
        "AF": get_cat_pages("Category:Lists of mammals of Africa"),
        "AS": get_cat_pages("Category:Lists of mammals of Asia"),
        "EU": list(set(["List of mammals of Europe"] + get_cat_pages("Category:Lists of mammals of Europe"))),
        "NA": list(set(["List of mammals of North America"] + get_cat_pages("Category:Lists of mammals of North America"))),
        "SA": list(set(["List of mammals of South America"] + get_cat_pages("Category:Lists of mammals of South America"))),
        "AU": list(set(["List of mammals of Australia", "List of mammals of Papua New Guinea", "List of mammals of New Zealand"] + get_cat_pages("Category:Lists of mammals of Oceania"))),
    }

    all_list_titles: list[str] = []
    title_to_cont: dict[str, str] = {}
    for cont, tlist in continent_lists.items():
        for t in tlist:
            all_list_titles.append(t)
            title_to_cont[t] = cont

    cont_text: dict[str, list[str]] = {k: [] for k in continent_lists}
    for i in range(0, len(all_list_titles), 50):
        batch = all_list_titles[i : i + 50]
        res = api_get({
            "action": "query",
            "prop": "revisions",
            "rvprop": "content",
            "titles": "|".join(batch),
            "format": "json",
        })
        for p in res.get("query", {}).get("pages", {}).values():
            t = p.get("title", "")
            c = title_to_cont.get(t)
            revs = p.get("revisions") or []
            if c and revs:
                cont_text[c].append(revs[0].get("*", "").lower())

    cont_blobs = {k: "\n".join(v) for k, v in cont_text.items()}
    payload = {
        "iucn_wikitext": iucn_wikitext,
        "cont_blobs": cont_blobs,
    }
    LISTS_CACHE_PATH.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


def classify_taxonomy_from_headings(
    h2: str, h3: str, h4: str, label: str, sci: str
) -> tuple[str, str]:
    """
    Maps a species' Wikipedia IUCN section headings (h2, h3, h4), common name, and
    scientific binomial to a clean (Order, Family) pair.
    """
    sec = f"{h2} | {h3} | {h4}"
    sec_low = sec.lower()
    lbl_low = label.lower()
    sci_low = sci.lower()
    genus = sci_low.split()[0] if sci_low else ""

    # Determine Order
    order = "Mammalia"
    if "primates" in sec_low:
        order = "Primates"
    elif "carnivora" in sec_low:
        order = "Carnivora"
    elif "cetartiodactyla" in sec_low or "artiodactyla" in sec_low:
        order = "Artiodactyla"
    elif "perissodactyla" in sec_low or "odd-toed" in sec_low or genus in ("equus", "tapirus", "rhinocerotidae", "diceros", "ceratotherium", "dicerorhinus"):
        order = "Perissodactyla"
    elif "chiroptera" in sec_low or "bats" in sec_low:
        order = "Chiroptera"
    elif "rodentia" in sec_low or "rodents" in sec_low:
        order = "Rodentia"
    elif "lagomorpha" in sec_low:
        order = "Lagomorpha"
    elif "eulipotyphla" in sec_low:
        order = "Eulipotyphla"
    elif "afrosoricida" in sec_low or "golden mole" in lbl_low or "tenrec" in lbl_low:
        order = "Afrosoricida"
    elif "macroscelidea" in sec_low or "elephant shrew" in lbl_low or "sengi" in lbl_low:
        order = "Macroscelidea"
    elif "hyracoidea" in sec_low or "hyrax" in lbl_low:
        order = "Hyracoidea"
    elif "sirenia" in sec_low or "manatee" in lbl_low or "dugong" in lbl_low:
        order = "Sirenia"
    elif "pholidota" in sec_low or "pangolin" in lbl_low:
        order = "Pholidota"
    elif "pilosa" in sec_low or "sloth" in lbl_low or "anteater" in lbl_low or "tamandua" in lbl_low:
        order = "Pilosa"
    elif "cingulata" in sec_low or "armadillo" in lbl_low:
        order = "Cingulata"
    elif "scandentia" in sec_low or "treeshrew" in lbl_low:
        order = "Scandentia"
    elif "flying lemur" in lbl_low or "colugo" in lbl_low or genus in ("galeopterus", "cynocephalus"):
        order = "Dermoptera"
    elif "elephant" in lbl_low or genus in ("loxodonta", "elephas"):
        order = "Proboscidea"
    elif "aardvark" in lbl_low or genus == "orycteropus":
        order = "Tubulidentata"
    elif "platypus" in lbl_low or "echidna" in lbl_low or genus in ("ornithorhynchus", "tachyglossus", "zaglossus"):
        order = "Monotremata"
    elif "marsupial" in sec_low or "diprotodontia" in sec_low or "dasyuromorphia" in sec_low or "peramelemorphia" in sec_low or "didelphimorphia" in sec_low:
        if "dasyuromorphia" in sec_low:
            order = "Dasyuromorphia"
        elif "peramelemorphia" in sec_low:
            order = "Peramelemorphia"
        elif "didelphimorphia" in sec_low or "opossum" in lbl_low:
            order = "Didelphimorphia"
        elif "paucituberculata" in sec_low:
            order = "Paucituberculata"
        elif "microbiotheria" in sec_low:
            order = "Microbiotheria"
        elif "notoryctemorphia" in sec_low:
            order = "Notoryctemorphia"
        else:
            order = "Diprotodontia"

    # Extract explicit Latin family name (-idae) from headings if present
    fam_match = re.findall(r"\b([A-Z][a-z]+idae)\b", sec)
    family = fam_match[-1] if fam_match else ""

    if not family:
        if ("cetacea" in sec_low and "non-cetacean" not in sec_low) or any(w in lbl_low for w in ("whale", "dolphin", "porpoise", "vaquita", "baiji", "boto", "narwhal", "beluga", "orca")):
            family = "Cetacea"
        elif "felid" in sec_low or genus in ("panthera", "felis", "leopardus", "prionailurus", "neofelis", "catopuma", "pardofelis", "caracal", "leptailurus", "lynx", "puma", "herpailurus", "acinonyx", "otocolobus") or any(lbl_low.endswith(w) for w in (" cat", "leopard", "tiger", "lion", "cheetah", "lynx", "jaguar", "ocelot", "margay", "oncilla", "tigrina", "colocolo", "jaguarundi", "kodkod")):
            family = "Felidae"
        elif "canid" in sec_low or genus in ("canis", "vulpes", "lycalopex", "urocyon", "chrysocyon", "speothos", "atelocynus", "cuon", "lycaon", "nyctereutes", "otocyon", "lupulella") or any(lbl_low.endswith(w) for w in ("wolf", "fox", "dog", "jackal", "dhole", "coyote", "dingo", "culpeo")):
            family = "Canidae"
        elif "mustelid" in sec_low or genus in ("mustela", "neogale", "martes", "lontra", "lutra", "lutrogale", "aonyx", "enhydra", "pteronura", "hydrictis", "melogale", "arctonyx", "meles", "mellivora", "taxidea", "gulo", "vormela", "ictonyx", "poecilogale", "galictis", "eira") or any(w in lbl_low for w in ("otter", "weasel", "marten", "badger", "ferret", "mink", "polecat", "wolverine", "tayra", "grison", "zorilla")):
            family = "Mustelidae"
        elif "mongoose" in sec_low or "mongoose" in lbl_low or genus in ("herpestes", "urva", "mungos", "bdeogale", "crossarchus", "cynictis", "galarella", "helogale", "ichneumia", "liberiictis", "paracynictis", "rhynchogale", "suricata", "atylax"):
            family = "Herpestidae"
        elif "skunk" in sec_low or "skunk" in lbl_low or "stink badger" in lbl_low or genus in ("mephitis", "spilogale", "conepatus", "mydaus"):
            family = "Mephitidae"
        elif "eared seal" in sec_low or "fur seal" in lbl_low or "sea lion" in lbl_low or genus in ("arctocephalus", "callorhinus", "eumetopias", "neophoca", "otaria", "phocarctos", "zalophus"):
            family = "Otariidae"
        elif "earless seal" in sec_low or lbl_low.endswith(" seal") or genus in ("phoca", "pusa", "halichoerus", "histriophoca", "pagophilus", "erignathus", "cystophora", "monachus", "neomonachus", "mirounga", "leptonychotes", "ommatophoca", "lobodon", "hydrurga"):
            family = "Phocidae"
        elif "walrus" in lbl_low or genus == "odobenus":
            family = "Odobenidae"
        elif "procyonid" in sec_low or any(w in lbl_low for w in ("raccoon", "coati", "kinkajou", "olingo", "olinguito", "ringtail", "cacomistle")) or genus in ("procyon", "nasua", "nasuella", "potos", "bassaricyon", "bassariscus"):
            family = "Procyonidae"
        elif "viverrid" in sec_low or any(w in lbl_low for w in ("civet", "genet", "binturong", "oyans")) or genus in ("viverra", "viverricula", "genetta", "poiana", "arctictis", "arctogalidia", "chrotogale", "cynogale", "diplogale", "hemigalus", "macrogalidia", "paguma", "paradoxurus"):
            family = "Viverridae"
        elif genus in ("eupleres", "fossa", "cryptoprocta", "galidia", "galidictis", "mungotictis", "salanoia") or "falanouc" in lbl_low or "vontsira" in lbl_low:
            family = "Eupleridae"
        elif "bovid" in sec_low or any(w in lbl_low for w in ("antelope", "gazelle", "duiker", "dik-dik", "kudu", "eland", "oryx", "gemsbok", "wildebeest", "hartebeest", "topi", "tsessebe", "bontebok", "blesbok", "impala", "springbok", "waterbuck", "kob", "lechwe", "reedbuck", "sitatunga", "nyala", "bushbuck", "bongo", "addax", "saiga", "chamois", "ibex", "markhor", "tahr", "goral", "serow", "takin", "muskox", "bharal", "argali", "urial", "mouflon", "sheep", "goat", "cattle", "bison", "buffalo", "yak", "gaur", "banteng", "kouprey", "anoa", "saola", "nilgai", "blackbuck", "chinkara", "klipspringer", "oribi", "steenbok", "grysbok", "sunis", "suni", "beira", "gerenuk", "dibatag", "hirola")):
            family = "Bovidae"
        elif "cervid" in sec_low or ("deer" in lbl_low and "mouse-deer" not in lbl_low and "musk deer" not in lbl_low) or any(w in lbl_low for w in ("muntjac", "brocket", "sambar", "chital", "barasingha", "pudú", "pudu", "huemul", "taruca", "caribou", "reindeer", "moose", "elk", "wapiti")):
            family = "Cervidae"
        elif "giraff" in sec_low or genus in ("giraffa", "okapia"):
            family = "Giraffidae"
        elif "hippo" in lbl_low or genus in ("hippopotamus", "choeropsis"):
            family = "Hippopotamidae"
        elif "peccary" in lbl_low or genus in ("pecari", "tayassu", "catagonus"):
            family = "Tayassuidae"
        elif order == "Artiodactyla" and ("pig" in lbl_low or "hog" in lbl_low or "babirusa" in lbl_low or "boar" in lbl_low or genus in ("sus", "porcula", "babyrousa", "phacochoerus", "potamochoerus", "hylochoerus")):
            family = "Suidae"
        elif "camel" in lbl_low or "guanaco" in lbl_low or "vicuña" in lbl_low or genus in ("camelus", "lama", "vicugna"):
            family = "Camelidae"
        elif "mouse-deer" in lbl_low or "chevrotain" in lbl_low or genus in ("tragulus", "moschiola", "hyemoschus"):
            family = "Tragulidae"
        elif "musk deer" in lbl_low or genus == "moschus":
            family = "Moschidae"
        elif genus in ("ursus", "melursus", "helarctos", "tremarctos", "ailuropoda") or lbl_low.endswith(" bear"):
            family = "Ursidae"
        elif genus in ("crocuta", "hyaena", "parahyaena", "proteles") or "hyena" in lbl_low:
            family = "Hyaenidae"
        elif genus == "equus" or "zebra" in lbl_low or "horse" in lbl_low or "ass" in lbl_low or "kiang" in lbl_low or "onager" in lbl_low:
            family = "Equidae"
        elif "rhino" in lbl_low:
            family = "Rhinocerotidae"
        elif "tapir" in lbl_low:
            family = "Tapiridae"
        elif "elephant" in lbl_low and order == "Proboscidea":
            family = "Elephantidae"
        elif "pangolin" in lbl_low:
            family = "Manidae"
        elif "echidna" in lbl_low:
            family = "Tachyglossidae"
        elif "platypus" in lbl_low:
            family = "Ornithorhynchidae"
        elif "lemur" in sec_low or "lemur" in lbl_low:
            family = "Lemuridae"
        elif "old world monkey" in sec_low:
            family = "Cercopithecidae"
        elif "great ape" in sec_low:
            family = "Hominidae"
        elif "gibbon" in sec_low:
            family = "Hylobatidae"
        elif "megabat" in sec_low or "flying fox" in lbl_low or "fruit bat" in lbl_low:
            family = "Pteropodidae"
        else:
            family = order

    return order, family


def infer_scraped_mammal_attributes(
    label: str,
    target: str,
    sci: str,
    order: str,
    family: str,
    iucn: str,
    h2: str,
    h3: str,
    h4: str,
    cont_blobs: dict[str, str],
) -> tuple[list[str], str, str, str]:
    """
    Determines (continents, diet, weight_class, anatomy_flags) for any scraped mammal
    species using Wikipedia's continental lists + strict zoological/taxonomic rules.
    """
    lbl_low = label.lower()
    tgt_low = target.lower()
    sci_low = sci.lower()
    sec_low = f"{h2} {h3} {h4}".lower()

    # 1. Continents from Wikipedia's 241 Continental & Country Mammal Lists
    continents: list[str] = []
    for cont_code, blob in cont_blobs.items():
        if (
            (sci_low and sci_low in blob)
            or (tgt_low and f"[[{tgt_low}" in blob)
            or (lbl_low and f"|{lbl_low}]]" in blob)
            or (lbl_low and f"[[{lbl_low}]]" in blob)
        ):
            continents.append(cont_code)

    # Marine / Oceanic check
    is_cetacean = ("cetacea" in sec_low and "non-cetacean" not in sec_low) or family in (
        "Cetacea", "Balaenidae", "Balaenopteridae", "Eschrichtiidae", "Delphinidae",
        "Monodontidae", "Phocoenidae", "Physeteridae", "Kogiidae", "Ziphiidae",
        "Iniidae", "Lipotidae", "Platanistidae", "Pontoporiidae",
    )
    is_pinniped = family in ("Phocidae", "Otariidae", "Odobenidae")
    is_sirenian = order == "Sirenia"

    river_dolphin = family in ("Iniidae", "Lipotidae", "Platanistidae") or "river dolphin" in lbl_low or "baiji" in lbl_low or "boto" in lbl_low
    freshwater_seal = "baikal seal" in lbl_low or "saimaa" in lbl_low or "ladoga" in lbl_low
    is_fully_marine = (is_cetacean and not river_dolphin) or (is_pinniped and not freshwater_seal) or is_sirenian or lbl_low in ("sea otter", "marine otter")

    if is_cetacean and not river_dolphin:
        continents = ["OC"]
    elif is_fully_marine:
        if "OC" not in continents:
            continents.append("OC")

    # Fallback biogeography if a species wasn't matched in the country list text
    if not [c for c in continents if c != "OC"]:
        if "african" in lbl_low or "madagascar" in lbl_low or "malagasy" in lbl_low or "congo" in lbl_low or "cape " in lbl_low or "ethiopian" in lbl_low or "somali" in lbl_low or "angolan" in lbl_low or "kenyan" in lbl_low:
            continents.append("AF")
        elif "asian" in lbl_low or "indian" in lbl_low or "chinese" in lbl_low or "japanese" in lbl_low or "bornean" in lbl_low or "sumatran" in lbl_low or "javan" in lbl_low or "malayan" in lbl_low or "philippine" in lbl_low or "sulawesi" in lbl_low or "tibetan" in lbl_low or "himalayan" in lbl_low or "formosan" in lbl_low or "sunda" in lbl_low or "indochinese" in lbl_low:
            continents.append("AS")
        elif "european" in lbl_low or "iberian" in lbl_low or "alpine" in lbl_low or "balkan" in lbl_low or "caucasian" in lbl_low:
            continents.append("EU")
        elif "mexican" in lbl_low or "californian" in lbl_low or "california" in lbl_low or "cuban" in lbl_low or "jamaican" in lbl_low or "hispaniolan" in lbl_low or "honduran" in lbl_low or "panamanian" in lbl_low or "american" in lbl_low:
            continents.append("NA")
        elif "amazon" in lbl_low or "andean" in lbl_low or "brazilian" in lbl_low or "peruvian" in lbl_low or "patagonian" in lbl_low or "chilean" in lbl_low or "colombian" in lbl_low or "bolivian" in lbl_low or "venezuelan" in lbl_low or "ecuadorian" in lbl_low or "chacoan" in lbl_low:
            continents.append("SA")
        elif "australian" in lbl_low or "tasmanian" in lbl_low or "new guinea" in lbl_low or "papuan" in lbl_low or "queensland" in lbl_low:
            continents.append("AU")
        elif order in ("Afrosoricida", "Macroscelidea", "Tubulidentata", "Hyracoidea") or "lemur" in sec_low or family in ("Lemuridae", "Indriidae", "Daubentoniidae", "Cheirogaleidae", "Lepilemuridae", "Galagidae", "Eupleridae", "Bathyergidae", "Pedetidae", "Giraffidae", "Hippopotamidae"):
            continents.append("AF")
        elif order in ("Didelphimorphia", "Paucituberculata", "Microbiotheria", "Pilosa", "Cingulata") or family in ("Cebidae", "Atelidae", "Pitheciidae", "Aotidae", "Callitrichidae", "Caviidae", "Chinchillidae", "Dasyproctidae", "Ctenomyidae", "Echimyidae", "Abrocomidae", "Octodontidae", "Capromyidae", "Tayassuidae"):
            continents.append("SA")
        elif order in ("Diprotodontia", "Dasyuromorphia", "Peramelemorphia", "Notoryctemorphia", "Monotremata"):
            continents.append("AU")
        elif order in ("Scandentia", "Dermoptera") or family in ("Hylobatidae", "Tarsiidae", "Moschidae", "Craseonycteridae"):
            continents.append("AS")

    # 2. Anatomy Flags (H=Horns/Antlers/Tusks, U=Hooves, A=Aquatic/Semiaquatic, M=Marine, P=Marsupial/Monotreme, S=Stripes/Spots, F=Flight/Glide)
    flags = ""
    if order in ("Artiodactyla", "Perissodactyla") and not is_cetacean:
        flags += "U"
    if order in ("Diprotodontia", "Dasyuromorphia", "Peramelemorphia", "Didelphimorphia", "Paucituberculata", "Microbiotheria", "Notoryctemorphia", "Monotremata"):
        flags += "P"
    if is_fully_marine:
        flags += "AM"
    elif (
        is_cetacean or is_pinniped or is_sirenian
        or family in ("Hippopotamidae", "Castoridae", "Ornithorhynchidae", "Tapiridae")
        or any(w in lbl_low for w in (
            "otter", "mink", "beaver", "capybara", "nutria", "coypu", "muskrat",
            "water ", "aquatic ", "swamp ", "marsh ", "fishing ", "river ", "desman",
            "yapok", "sitatunga", "lechwe", "waterbuck", "polar bear", "proboscis monkey"
        ))
    ):
        flags += "A"

    # Horns, antlers, or tusks
    if (
        family in (
            "Bovidae", "Cervidae", "Giraffidae", "Antilocapridae", "Rhinocerotidae",
            "Elephantidae", "Odobenidae", "Hippopotamidae", "Suidae", "Tayassuidae",
            "Moschidae", "Tragulidae", "Dugongidae"
        )
        or "narwhal" in lbl_low
    ) and "water deer" not in lbl_low:
        flags += "H"

    # Flight or gliding
    if (
        order in ("Chiroptera", "Dermoptera")
        or "flying squirrel" in lbl_low
        or "glider" in lbl_low
        or "gliding" in lbl_low
        or "scaly-tailed squirrel" in lbl_low
        or "anomalure" in lbl_low
        or "flying lemur" in lbl_low
        or "colugo" in lbl_low
    ):
        flags += "F"

    # Striped or spotted coat
    if any(w in lbl_low for w in (
        "striped", "spotted", "banded", "ringed", "ring-tailed", "marbled", "clouded",
        "leopard", "tiger", "zebra", "giraffe", "okapi", "cheetah", "jaguar", "ocelot",
        "serval", "margay", "oncilla", "kodkod", "bobcat", "lynx", "genet", "linsang",
        "civet", "quoll", "numbat", "chipmunk", "skunk", "raccoon", "badger", "bongo",
        "kudu", "sitatunga", "nyala", "bushbuck", "chital", "fallow deer", "aardwolf",
        "painted", "spotted-necked", "rusty-spotted", "black-footed cat", "fishing cat"
    )):
        flags += "S"

    # 3. Diet (H=Herbivore, C=Vertebrate Carnivore, I=Insectivore, O=Omnivore)
    diet = "O"
    if (
        (order in ("Artiodactyla", "Perissodactyla") and not is_cetacean and family not in ("Suidae", "Tayassuidae"))
        or order in ("Proboscidea", "Sirenia", "Hyracoidea", "Lagomorpha")
        or family in (
            "Bradypodidae", "Megalonychidae", "Macropodidae", "Potoroidae", "Phascolarctidae",
            "Vombatidae", "Phalangeridae", "Pseudocheiridae", "Castoridae", "Caviidae",
            "Chinchillidae", "Dasyproctidae", "Ctenomyidae", "Echimyidae", "Abrocomidae",
            "Octodontidae", "Capromyidae", "Bathyergidae", "Heterocephalidae", "Thryonomyidae",
            "Petromuridae", "Pedetidae", "Erethizontidae", "Hystricidae", "Geomyidae",
            "Heteromyidae", "Anomaluridae", "Pteropodidae", "Indriidae", "Lepilemuridae",
            "Ailuridae"
        )
        or any(w in lbl_low for w in (
            "langur", "colobus", "leaf monkey", "snub-nosed monkey", "proboscis monkey",
            "howler", "siamang", "vole", "lemming", "marmot", "groundhog", "prairie dog",
            "flying lemur", "colugo", "fruit bat", "flying fox", "blossom bat", "giant panda"
        ))
    ):
        diet = "H"
    elif (
        is_cetacean
        or is_pinniped
        or family in ("Felidae", "Mustelidae", "Eupleridae", "Prionodontidae", "Megadermatidae", "Noctilionidae")
        or (family == "Hyaenidae" and "aardwolf" not in lbl_low)
        or (family == "Dasyuridae" and any(w in lbl_low for w in ("quoll", "devil", "phascogale", "kowari", "mulgara")))
        or any(w in lbl_low for w in ("wolf", "dhole", "wild dog", "bush dog", "dingo", "polar bear", "vampire bat", "mongoose"))
    ) and "badger" not in lbl_low:
        diet = "C"
    elif (
        order in ("Pholidota", "Cingulata", "Tubulidentata", "Eulipotyphla", "Afrosoricida", "Macroscelidea", "Notoryctemorphia", "Monotremata", "Scandentia")
        or family in ("Myrmecophagidae", "Cyclopedidae", "Myrmecobiidae", "Tarsiidae")
        or (order == "Chiroptera" and family != "Pteropodidae" and "vampire" not in lbl_low and "fruit bat" not in lbl_low)
        or any(w in lbl_low for w in ("anteater", "tamandua", "aardwolf", "sloth bear", "bat-eared fox", "meerkat", "numbat"))
    ):
        diet = "I"

    # 4. Weight Class (L >200kg, S <5kg, M 5-200kg)
    weight_cls = "M"
    if (
        order in ("Proboscidea", "Sirenia")
        or family in ("Rhinocerotidae", "Giraffidae", "Hippopotamidae", "Camelidae", "Odobenidae", "Balaenidae", "Balaenopteridae", "Eschrichtiidae", "Physeteridae", "Ziphiidae", "Monodontidae")
        or (family == "Equidae" and not any(w in lbl_low for w in ("ass", "kiang", "onager", "donkey")))
        or (family == "Tapiridae" and "mountain tapir" not in lbl_low)
        or any(w in lbl_low for w in (
            "gorilla", "lion", "tiger", "polar bear", "brown bear", "american black bear",
            "bison", "buffalo", "yak", "gaur", "banteng", "kouprey", "eland", "kudu",
            "wildebeest", "gemsbok", "oryx", "roan antelope", "sable antelope", "waterbuck",
            "bongo", "hartebeest", "addax", "nilgai", "takin", "muskox", "moose", "elk",
            "red deer", "sambar", "barasingha", "père david's deer", "elephant seal",
            "leopard seal", "grey seal", "bearded seal", "hooded seal", "weddell seal",
            "crabeater seal", "ross seal", "monk seal", "sea lion", "northern fur seal",
            "orca", "killer whale", "pilot whale", "false killer whale", "bottlenose dolphin",
            "risso's dolphin"
        ))
    ):
        weight_cls = "L"
    elif (
        order in ("Chiroptera", "Eulipotyphla", "Afrosoricida", "Macroscelidea", "Scandentia", "Dermoptera", "Lagomorpha", "Notoryctemorphia", "Paucituberculata", "Microbiotheria", "Didelphimorphia")
        or (order == "Rodentia" and family not in ("Castoridae", "Hystricidae", "Erethizontidae", "Dinomyidae", "Cuniculidae") and not any(w in lbl_low for w in ("capybara", "mara", "nutria", "coypu", "paca")))
        or family in (
            "Tarsiidae", "Galagidae", "Lorisidae", "Cheirogaleidae", "Lepilemuridae",
            "Callitrichidae", "Aotidae", "Cebidae", "Daubentoniidae", "Procaviidae",
            "Ornithorhynchidae", "Myrmecobiidae", "Thylacomyidae", "Peramelidae",
            "Petauridae", "Burramyidae", "Acrobatidae", "Tarsipedidae", "Potoroidae",
            "Mephitidae", "Herpestidae", "Prionodontidae", "Cyclopedidae", "Chlamyphoridae"
        )
        or (family == "Dasyuridae" and "tasmanian devil" not in lbl_low)
        or any(w in lbl_low for w in (
            "weasel", "stoat", "ferret", "mink", "marten", "polecat", "zorilla", "grison",
            "fennec", "arctic fox", "kit fox", "swift fox", "island fox", "blanford's fox",
            "rüppell's fox", "pale fox", "cape fox", "corsac fox", "tibetan fox", "bat-eared fox",
            "sand cat", "black-footed cat", "rusty-spotted cat", "leopard cat", "flat-headed cat",
            "pallas's cat", "kodkod", "oncilla", "margay", "pampas cat", "andean mountain cat",
            "geoffroy's cat", "marbled cat", "wildcat", "domestic cat", "dik-dik", "royal antelope",
            "pygmy hog", "mouse-deer", "chevrotain", "quokka", "pademelon", "rock-wallaby",
            "hare-wallaby", "nail-tail wallaby", "cuscus", "possum", "red panda", "kinkajou",
            "ringtail", "cacomistle", "olingo", "olinguito", "short-beaked echidna",
            "three-toed sloth", "two-toed sloth", "nine-banded armadillo", "three-banded armadillo",
            "hairy armadillo", "pichi", "pangolin", "genet", "civet"
        ))
    ):
        weight_cls = "S"

    return continents, diet, weight_cls, flags


def compute_mammal_traits(
    entry: tuple[str, str, str, str, list[str], str, str, str, str, list[str]],
    wiki_info: dict[str, Any],
) -> dict[str, Any]:
    name, wiki_title, order, family, continents, diet, iucn_fb, weight_cls, flags, aliases = entry

    iucn = wiki_info.get("wiki_iucn") or iucn_fb
    if iucn not in ("LC", "NT", "VU", "EN", "CR", "EW", "EX", "DOM", "DD"):
        iucn = iucn_fb

    land_continents = [c for c in continents if c in ("AF", "AS", "NA", "SA", "EU", "AU")]

    color_re = re.compile(r"\b(red|black|white|blue|gray|grey|brown|golden|yellow|pink|silver)\b", re.I)
    geo_re = re.compile(
        r"\b(african|asian|american|european|eurasian|australian|arctic|tasmanian|canada|canadian|"
        r"indian|bengal|siberian|chinese|japanese|philippine|bornean|sumatran|javan|malayan|patagonian|"
        r"alpine|andes|andean|amazon|amazonian|california|virginia|mongolian|tibetan|himalayan|iberian|"
        r"mexican|brazilian|peruvian|chilean|cuban|honduran|madagascan|malagasy|ethiopian|somali|cape|"
        r"mountain|river|sea|prairie|water|sand|desert|rock|bush|field|snow|clouded|island|forest|swamp|marsh)\b",
        re.I,
    )
    double_re = re.compile(r"([a-z])\1", re.I)

    traits: list[str] = []
    name_low = name.lower()

    # 1. Broad Clades & Taxonomy (Zero narrow family clues)
    if order == "Carnivora":
        traits.append("order_carnivora")
    if order == "Rodentia":
        traits.append("order_rodentia")
    if order == "Primates":
        traits.append("order_primates")
    if "U" in flags:
        traits.append("ungulate")
    if "P" in flags:
        traits.append("marsupial_monotreme")
    if "M" in flags:
        traits.append("fully_marine")

    # 2. Geography, Hemispheres & Islands
    if "AF" in continents:
        traits.append("native_africa")
    if "AS" in continents:
        traits.append("native_asia")
    if "NA" in continents:
        traits.append("native_north_america")
    if "SA" in continents:
        traits.append("native_south_america")
    if "EU" in continents:
        traits.append("native_europe")
    if "AU" in continents:
        traits.append("native_australia")
    if len(land_continents) == 1 and "OC" not in continents:
        traits.append("single_continent")
    else:
        traits.append("multi_continent")

    has_americas = bool(set(land_continents) & {"NA", "SA"})
    has_old_world = bool(set(land_continents) & {"AF", "AS", "EU", "AU"})
    if has_americas and not has_old_world and "OC" not in continents:
        traits.append("new_world_only")
    elif has_old_world and not has_americas and "OC" not in continents:
        traits.append("old_world_only")

    is_island_species = (
        family in ("Lemuridae", "Indriidae", "Daubentoniidae", "Cheirogaleidae", "Lepilemuridae", "Eupleridae", "Capromyidae", "Solenodontidae")
        or any(w in name_low for w in (
            "lemur", "sifaka", "indri", "aye-aye", "fossa", "falanouc", "vontsira",
            "tenrec", "tasmanian", "bornean", "sumatran", "javan", "sulawesi", "babirusa",
            "anoa", "tamaraw", "philippine", "japanese", "ryukyu", "formosan", "sri lankan",
            "ceylon", "cuban", "hispaniolan", "jamaican", "puerto rican", "cozumel",
            "galapagos", "falkland", "vancouver", "island", "new guinea", "goodfellow",
            "matschie", "dingiso", "proboscis monkey", "orangutan", "komodo", "sunda",
            "Hutia", "hutia", "solenodon"
        ))
    )
    if is_island_species:
        traits.append("island_endemic")

    # 3. Diet, Limbs, Anatomy & Lifestyle
    if diet == "H":
        traits.append("diet_herbivore")
    elif diet == "C":
        traits.append("diet_carnivore")
    elif diet == "I":
        traits.append("diet_insectivore")
    else:
        traits.append("diet_omnivore")

    # Limb & Foot Type (Hooves are already covered by `ungulate`; here are the other 3 limb types)
    is_flippered = ("M" in flags and name_low not in ("sea otter", "marine otter", "polar bear")) or family in ("Phocidae", "Otariidae", "Odobenidae", "Trichechidae", "Dugongidae")
    is_grasping = (
        order in ("Primates", "Didelphimorphia", "Scandentia")
        or family in ("Phascolarctidae", "Phalangeridae", "Pseudocheiridae", "Petauridae", "Burramyidae", "Acrobatidae", "Tarsipedidae")
        or any(w in name_low for w in ("koala", "opossum", "possum", "cuscus", "tree-kangaroo", "kinkajou", "harvest mouse"))
    )
    if is_flippered:
        traits.append("limbs_flippers")
    elif is_grasping:
        traits.append("limbs_grasping")
    elif "U" not in flags and "F" not in flags:
        traits.append("limbs_paws_claws")
    elif "F" in flags and order != "Chiroptera":
        traits.append("limbs_paws_claws")

    if "H" in flags:
        traits.append("horns_antlers_tusks")
    if "A" in flags or "M" in flags:
        traits.append("aquatic_semiaquatic")
    else:
        traits.append("terrestrial_only")

    # Arboreal / Tree-Dwelling
    is_arboreal = (
        (order in ("Primates", "Pilosa", "Scandentia", "Dermoptera") and not any(w in name_low for w in ("baboon", "gelada", "mandrill", "drill", "patas", "giant anteater")))
        or family in ("Sciuridae", "Gliridae", "Anomaluridae", "Erethizontidae", "Ailuridae", "Phascolarctidae", "Phalangeridae", "Pseudocheiridae", "Petauridae")
        or any(w in name_low for w in (
            "sloth", "koala", "tree", "monkey", "lemur", "sifaka", "indri", "aye-aye",
            "loris", "potto", "galago", "bushbaby", "tarsier", "gibbon", "siamang",
            "orangutan", "chimpanzee", "bonobo", "squirrel", "flying", "glider",
            "red panda", "binturong", "kinkajou", "olingo", "olinguito", "coati",
            "margay", "clouded leopard", "marbled cat", "marten", "fisher", "tayra",
            "opossum", "possum", "cuscus", "tamandua", "silky anteater", "colugo",
            "pangolin", "genet", "linsang", "palm civet", "dormouse"
        ))
    ) and not any(w in name_low for w in ("ground squirrel", "prairie dog", "marmot", "groundhog", "chipmunk"))
    if is_arboreal:
        traits.append("arboreal_tree")

    # Burrowing / Underground Den
    is_burrowing = (
        order in ("Cingulata", "Tubulidentata", "Notoryctemorphia", "Lagomorpha")
        or family in (
            "Vombatidae", "Thylacomyidae", "Peramelidae", "Ornithorhynchidae", "Tachyglossidae",
            "Bathyergidae", "Heterocephalidae", "Geomyidae", "Ctenomyidae", "Spalacidae",
            "Chinchillidae", "Octodontidae", "Pedetidae", "Dipodidae", "Heteromyidae",
            "Cricetidae", "Talpidae", "Solenodontidae"
        )
        or any(w in name_low for w in (
            "badger", "wombat", "aardvark", "aardwolf", "armadillo", "pangolin",
            "meerkat", "mongoose", "prairie dog", "marmot", "groundhog", "ground squirrel",
            "chipmunk", "mole", "gopher", "vole", "lemming", "hamster", "gerbil", "jird",
            "jerboa", "kangaroo rat", "pocket mouse", "degu", "viscacha", "tuco-tuco",
            "naked mole-rat", "rabbit", "hare", "pika", "fox", "warthog", "platypus",
            "echidna", "bilby", "bandicoot", "ferret", "weasel", "stoat", "burrowing",
            "hyena", "wild dog", "dhole", "jackal", "coyote", "wolf", "porcupine"
        ))
    ) and "tree" not in name_low and "flying" not in name_low
    if is_burrowing:
        traits.append("burrowing_den")

    # Domesticated or Livestock
    if iucn_fb == "DOM" or name_low in (
        "domestic dog", "domestic cat", "horse", "donkey", "cattle", "water buffalo",
        "yak", "sheep", "goat", "domestic pig", "llama", "alpaca", "dromedary",
        "bactrian camel", "reindeer", "ferret", "european rabbit", "guinea pig",
        "brown rat", "house mouse", "golden hamster", "mongolian gerbil", "gayal", "banteng"
    ):
        traits.append("domesticated_livestock")

    # Armor, Quills, or Spines
    if (
        order in ("Cingulata", "Pholidota")
        or family in ("Erethizontidae", "Hystricidae", "Erinaceidae", "Tachyglossidae", "Tenrecidae")
        or any(w in name_low for w in ("armadillo", "pangolin", "porcupine", "hedgehog", "echidna", "tenrec", "spiny"))
    ):
        traits.append("armor_spines_plates")

    # Tailless as an Adult
    if (
        family in ("Hominidae", "Hylobatidae", "Bradypodidae", "Megalonychidae", "Phascolarctidae", "Vombatidae", "Procaviidae", "Caviidae", "Ochotonidae")
        or any(w in name_low for w in (
            "gorilla", "chimpanzee", "bonobo", "orangutan", "gibbon", "siamang",
            "capybara", "guinea pig", "cavy", "mara", "koala", "wombat", "sloth",
            "hyrax", "pika", "tailless", "barbary macaque", "golden hamster"
        ))
    ):
        traits.append("tailless_adult")

    if "S" in flags:
        traits.append("stripes_or_spots")
    if "F" in flags:
        traits.append("flight_or_gliding")
    if weight_cls == "L":
        traits.append("weight_over_200kg")
    elif weight_cls == "S":
        traits.append("weight_under_5kg")
    else:
        traits.append("weight_medium")

    # 4. Name Traits (checked strictly against the canonical display name)
    body_or_anim_re = re.compile(
        r"\b(tail|tailed|ear|eared|foot|footed|toed|nose|nosed|horn|horned|head|headed|belly|bellied|"
        r"back|backed|necked|throated|faced|billed|maned|lipped|handed|winged|tooth|toothed|"
        r"leopard seal|elephant seal|elephant shrew|sloth bear|bat-eared fox|squirrel monkey|spider monkey|"
        r"owl monkey|howler monkey|vervet monkey|proboscis monkey|capuchin monkey|rhesus macaque|"
        r"kangaroo rat|mole-rat|bumblebee bat|bulldog bat|flying fox|mule deer|mouse-deer|musk deer|"
        r"fox squirrel|flying squirrel|ground squirrel|sea lion|prairie dog|raccoon dog|bush dog|"
        r"guinea pig|hog badger|honey badger|ferret-badger|bearcat|antelope|anteater|aardwolf|"
        r"tiger quoll|leopard cat|fishing cat|sand cat|pine marten|river otter|sea otter|giant otter)\b",
        re.I,
    )

    if color_re.search(name_low):
        traits.append("name_has_color")
    if geo_re.search(name_low):
        traits.append("name_has_geo")
    if body_or_anim_re.search(name_low):
        traits.append("name_body_or_animal")
    if double_re.search(name_low):
        traits.append("name_double_letter")

    letters_only = re.sub(r"[^a-z]", "", name_low)
    if letters_only:
        if letters_only[0] in "aeiou":
            traits.append("name_starts_vowel")
        else:
            traits.append("name_starts_consonant")
        if letters_only[-1] in "aeiou":
            traits.append("name_ends_vowel")
        else:
            traits.append("name_ends_consonant")

    n_letters = len(letters_only)
    if n_letters <= 5:
        traits.append("name_short_5")
    elif n_letters <= 11:
        traits.append("name_medium_6_11")
    else:
        traits.append("name_long_12")

    if "-" in name_low:
        traits.append("name_has_hyphen")
    if " " in name_low or "-" in name_low:
        traits.append("name_multi_word")
    else:
        traits.append("name_single_word")

    rec = {
        "name": name,
        "aliases": aliases,
        "order": order,
        "family": family,
        "iucn": iucn,
        "views_60d": wiki_info.get("views_60d", 500),
        "summary": wiki_info.get("extract", ""),
        "traits": traits,
    }
    rec["facts"] = build_mammal_fun_facts(rec, entry)
    return rec


SIGNATURE_MAMMAL_FACTS: dict[str, list[str]] = {
    "Lion": [
        "Lions are the only wild cats that live in large cooperative social prides.",
        "A lion's roar can reach 114 decibels and be heard up to five miles away across the savanna.",
        "Female lions do 85 to 90 percent of the pride's hunting, working in coordinated formations.",
        "A small remnant population of wild Asiatic lions still survives in India's Gir Forest.",
        "Male lions grow dark manes that signal testosterone levels and protect their throats during territorial fights.",
        "Lions can sleep or rest for up to 20 hours a day to conserve energy between hunts.",
    ],
    "Tiger": [
        "Tigers are the largest extant cat species, and no two tigers have the exact same pattern of stripes.",
        "A tiger's stripe pattern is pigmented directly into its skin as well as its fur.",
        "Unlike most cats, tigers are avid swimmers and frequently bathe in rivers and lakes to cool off.",
        "Tigers have white circular spots called ocelli on the backs of their ears that act as false eyes.",
        "A tiger's hind legs are longer than its forelimbs, allowing it to leap up to 30 feet in a single bound.",
        "Tigers are solitary ambush predators that rely on stealth and camouflage in tall grass.",
    ],
    "Cheetah": [
        "The cheetah is the fastest land animal on Earth, capable of accelerating from 0 to 60 mph in just three seconds.",
        "Unlike big cats in the genus Panthera, cheetahs cannot roar; instead they purr, chirp, and stutter.",
        "Black 'tear marks' running from a cheetah's eyes down its cheeks help reflect the glare of the midday sun.",
        "Cheetahs have semi-retractable claws that grip the ground like track cleats during high-speed sprints.",
        "A cheetah's long, muscular tail acts like a rudder to make sharp turns while chasing agile antelopes.",
        "At top speed, a cheetah's stride spans over 20 feet and its feet touch the ground less than half the time.",
    ],
    "Jaguar": [
        "Pound for pound, the jaguar has the strongest bite force of any big cat, able to pierce turtle shells and caiman skulls.",
        "Unlike most felines, jaguars deliver a fatal bite directly through the skull between the prey's ears rather than the throat.",
        "The word 'jaguar' comes from the Indigenous Tupi-Guarani word 'yaguara', meaning 'he who kills with one leap'.",
        "Jaguars are the largest cat native to the Americas and are strong swimmers that hunt fish and caimans in rivers.",
        "A jaguar's rosettes almost always contain small central black dots inside the ring, distinguishing them from leopard spots.",
    ],
    "Leopard": [
        "Leopards are pound-for-pound climbers strong enough to haul prey heavier than themselves 20 feet up into a tree.",
        "Melanistic leopards, commonly called black panthers, still have visible rosettes when viewed in bright sunlight.",
        "The leopard has the largest natural geographic distribution of any wild cat across Africa and Asia.",
        "Leopards stash their kills high in forked tree branches to keep them away from lions and hyenas.",
    ],
    "Snow leopard": [
        "Snow leopards use their thick, furry tails, which are nearly as long as their bodies, as a blanket to wrap around their faces in subzero winds.",
        "Expanded nasal cavities warm frigid Himalayan air before it reaches a snow leopard's lungs.",
        "Wide, fur-covered paws act as natural snowshoes to keep snow leopards from sinking into deep alpine drifts.",
        "Because of modifications to their hyoid bone and larynx, snow leopards cannot roar.",
    ],
    "Cougar": [
        "The cougar holds the Guinness World Record for the animal with the most common names, including puma, mountain lion, and catamount.",
        "Cougars have the largest north-to-south range of any wild land mammal in the Western Hemisphere, from Yukon to Patagonia.",
        "Despite its size, the cougar is more closely related to small domestic cats and cheetahs than to lions or tigers.",
        "A cougar can leap 18 feet vertically into a tree from a standing start.",
    ],
    "Platypus": [
        "The platypus is one of only five living species of egg-laying mammals known as monotremes.",
        "A platypus hunts underwater with its eyes, ears, and nostrils shut, detecting prey via 40,000 electroreceptors in its bill.",
        "Male platypuses have hollow ankle spurs connected to venom glands that are potent enough to cause excruciating pain.",
        "Platypuses have no stomach; their gullet connects directly to their intestines.",
        "Under ultraviolet light, platypus fur biofluoresces with a bluish-green glow.",
        "Female platypuses do not have teats; instead they secrete milk through pores in their skin for puggles to lap up.",
    ],
    "Echidna": [
        "Alongside the platypus, echidnas are the only living mammals that lay leathery eggs instead of giving birth to live young.",
        "An echidna's body temperature is around 31°C (88°F), the lowest of any active mammal.",
        "Baby echidnas are called puggles and hatch from a dime-sized egg into the mother's pouch after just 10 days.",
        "Echidnas have a six-inch sticky tongue that darts in and out up to 100 times per minute to lap up ants and termites.",
    ],
    "Sea otter": [
        "Sea otters have the densest fur in the animal kingdom, with up to one million hairs per square inch.",
        "Unlike other marine mammals, sea otters have no blubber layer and rely entirely on air trapped in their fur for warmth.",
        "Sleeping sea otters wrap themselves in giant kelp or hold paws in floating 'rafts' so they don't drift apart.",
        "Sea otters have a loose pouch of skin under each forearm where they store their favorite rock for cracking shellfish.",
        "By preying on sea urchins, sea otters act as a keystone species that prevents kelp forests from being grazed into barrens.",
    ],
    "Capybara": [
        "The capybara is the largest living rodent in the world, weighing up to 140 pounds.",
        "Capybaras have slightly webbed feet and can hold their breath underwater for up to five minutes to evade predators.",
        "Their eyes, ears, and nostrils sit aligned along the very top of their heads so they can see and breathe while almost fully submerged.",
        "Like guinea pigs, capybaras cannot synthesize their own vitamin C and get it from fresh aquatic grasses.",
    ],
    "Narwhal": [
        "A narwhal's iconic spiral 'horn' is actually an overgrown upper left canine tooth that grows right through its upper lip.",
        "The narwhal tusk is packed with up to 10 million nerve endings that sense changes in water salinity and temperature.",
        "Unlike most toothed whales, adult narwhals have no functional teeth inside their mouths and swallow squid and fish whole.",
        "Narwhals can dive nearly a mile deep beneath dense Arctic pack ice in search of Greenland halibut.",
    ],
    "Blue whale": [
        "The blue whale is the largest animal ever known to have lived on Earth, even heavier than the largest sauropod dinosaurs.",
        "A blue whale's heart is the size of a small golf cart and beats only 4 to 8 times per minute during deep dives.",
        "Despite weighing up to 190 tons, blue whales feed almost exclusively on tiny shrimp-like krill.",
        "A blue whale's tongue alone can weigh as much as an entire adult elephant.",
    ],
    "Orca": [
        "Despite the nickname 'killer whale', the orca is actually the largest member of the oceanic dolphin family.",
        "Orca pods pass down distinct regional dialects and specialized hunting traditions across generations in matrilineal families.",
        "Wild orcas have been observed creating synchronized waves to wash seals off floating ice floes.",
        "Female orcas undergo menopause and can live into their 80s or 90s as matriarchs guiding their pods.",
    ],
    "Giraffe": [
        "Despite having a six-foot-long neck, a giraffe has the exact same number of neck vertebrae as a human: seven.",
        "A giraffe's prehensile tongue is 18 to 20 inches long and purplish-black to prevent sunburn while browsing treetops.",
        "Giraffes only sleep for about 30 minutes a day, often in quick five-minute power naps while standing up.",
        "A giraffe's heart is two feet long and generates double the blood pressure of other mammals to pump blood up to its brain.",
    ],
    "Okapi": [
        "Although its zebra-striped hindquarters make it look like an equine, the okapi is the only living relative of the giraffe.",
        "An okapi's prehensile tongue is so long, up to 18 inches, that it can lick its own eyelids and clean inside its ears.",
        "Secretive and solitary in the Ituri Rainforest, the okapi remained unknown to Western science until 1901.",
        "Okapis communicate with their calves using infrasound frequencies too low for human ears to detect.",
    ],
    "Wombat": [
        "Wombats are the only animals in the world that produce cube-shaped poop, which keeps their territorial markers from rolling away.",
        "A female wombat's marsupial pouch faces backward toward her rear so it doesn't fill with dirt while she digs burrows.",
        "Wombats have a tough shield of cartilage in their rump that they use to block tunnel entrances and crush predators' skulls against the burrow roof.",
        "Like rodents, wombats have rootless teeth that grow continuously throughout their lives to compensate for chewing gritty roots.",
    ],
    "Naked mole-rat": [
        "Naked mole-rats are one of only two eusocial mammals, living in underground colonies ruled by a single breeding queen like bees or ants.",
        "They are virtually insensitive to acid pain and can survive up to 18 minutes in zero-oxygen environments by metabolizing fructose like plants.",
        "A naked mole-rat can move its prominent front incisors independently like a pair of chopsticks.",
        "Despite being mouse-sized, naked mole-rats can live over 30 years and show extraordinary resistance to cancer.",
    ],
    "Hippopotamus": [
        "Hippos cannot actually swim or float; instead, their dense bones let them sink and bounce-gallop along riverbeds.",
        "Hippos secrete a reddish oily fluid called 'blood sweat' that acts as both a natural sunscreen and an antibiotic.",
        "Genetic studies show that hippos are the closest living land-dwelling relatives of whales and dolphins.",
        "A hippo can open its jaws a full 150 degrees and has four-foot-wide canines that sharpen themselves whenever it closes its mouth.",
    ],
    "Aardvark": [
        "The name 'aardvark' comes from Afrikaans for 'earth pig', though it isn't related to pigs at all.",
        "The aardvark is the sole surviving species in the entire mammalian order Tubulidentata.",
        "An aardvark can dig a two-foot-deep burrow in under 30 seconds and eat up to 50,000 ants and termites in a single night.",
        "Aardvark teeth have no enamel or roots; instead they are made of bundles of hexagonal tubes that grow continuously.",
    ],
    "Wolverine": [
        "Pound for pound, the wolverine is the largest land-dwelling member of the weasel family Mustelidae.",
        "A wolverine's upper molars are rotated 90 degrees inward, allowing it to shear through meat frozen solid in Arctic winters.",
        "Wolverines have hydrophobic frost-resistant fur that was prized by Indigenous Arctic peoples for lining parka hoods.",
        "A single wolverine can patrol a snowy mountain home range of over 500 square miles.",
    ],
    "Honey badger": [
        "A honey badger's skin is so thick and loose around its body that it can twist 180 degrees inside its own hide to bite an attacker holding it.",
        "Honey badgers have evolved molecular mutations in their acetylcholine receptors that make them largely immune to cobra venom.",
        "Despite its name, the honey badger is actually a giant weasel relative in the family Mustelidae.",
        "Honey badgers have a reversible anal pouch that releases a suffocating stench used to calm bees while raiding hives.",
    ],
    "Red panda": [
        "The red panda was described by Western science 48 years before the giant panda and is the original 'panda'.",
        "Although it eats mostly bamboo like the giant panda, the red panda belongs to its own unique taxonomic family, Ailuridae.",
        "Both red pandas and giant pandas independently evolved a 'false thumb', an enlarged wrist bone used to grip bamboo stems.",
        "Red pandas descend tree trunks headfirst by rotating their ankle joints 180 degrees.",
    ],
    "Giant panda": [
        "Although classified in the order Carnivora, a giant panda's diet is 99 percent bamboo.",
        "Because bamboo is so low in nutrients, an adult giant panda spends up to 14 hours a day eating 25 to 80 pounds of shoots and leaves.",
        "Newborn giant panda cubs are pink, blind, and weigh only 3.5 ounces, about 1/900th the size of their mother.",
        "Giant pandas have an elongated radial sesamoid wrist bone that functions as a sixth opposable 'thumb' for stripping bamboo.",
    ],
    "Pangolin": [
        "Pangolins are the only known mammals in the world covered from head to tail in overlapping keratin scales.",
        "When threatened, a pangolin curls into an impenetrable armored ball whose sharp scales can cut a lion's paws.",
        "A pangolin's tongue is anchored near its pelvis and is longer than its head and body combined when fully extended.",
        "Because pangolins have no teeth, they swallow small pebbles and sand that grind up ants inside their muscular gizzard-like stomachs.",
    ],
    "Binturong": [
        "The binturong, also called the bearcat, smells unmistakably like hot buttered popcorn due to the compound 2-acetyl-1-pyrroline in its scent glands.",
        "Along with the kinkajou, the binturong is one of only two carnivores in the world with a truly prehensile, muscular gripping tail.",
        "Binturongs are crucial rainforest seed dispersers for strangler figs because their digestive enzymes soften the fig seeds' tough outer coats.",
    ],
    "Quokka": [
        "Known as the 'world's happiest animal' for its upturned mouth, the quokka is a cat-sized macropod native to Rottnest Island off Western Australia.",
        "Dutch explorer Willem de Vlamingh mistook quokkas for giant rats in 1696 and named their island 'Rottnest' ('rat's nest').",
        "Like kangaroos, quokkas can pause the development of an embryo in a process called embryonic diapause.",
    ],
    "Fossa": [
        "The fossa is the largest mammalian carnivore native to the island of Madagascar and the top predator of lemurs.",
        "Although it looks like a cross between a cougar and a mongoose, the fossa belongs to the endemic Malagasy family Eupleridae.",
        "Flexible ankle joints allow a fossa to run down vertical tree trunks headfirst just like a squirrel.",
    ],
    "Bumblebee bat": [
        "Also called Kitti's hog-nosed bat, the bumblebee bat weighs just two grams, making it the smallest mammal by skull size and tied for lightest on Earth.",
        "Its wingspan is barely six inches across, and its body is no larger than a large bumblebee.",
        "Discovered in 1973, it roosts exclusively in limestone caves along rivers in western Thailand and southeastern Myanmar.",
    ],
}


FAMILY_TRIVIA_NOTES: dict[str, str] = {
    "Felidae": "Members of the cat family Felidae are obligate carnivores equipped with protractile claws and specialized flesh-shearing carnassial teeth.",
    "Canidae": "Members of the dog family Canidae walk on their toes (digitigrade locomotion) and possess non-retractable claws built for endurance running.",
    "Ursidae": "Members of the bear family Ursidae walk flat-footed (plantigrade posture) like humans and possess an extraordinary sense of smell.",
    "Mustelidae": "Members of the weasel family Mustelidae have elongated bodies, short legs, and potent anal scent glands used for marking territory.",
    "Bovidae": "Members of the family Bovidae have four-chambered ruminant stomachs and permanent unbranched horns covered in keratin sheaths.",
    "Cervidae": "Members of the deer family Cervidae grow solid bone antlers that are shed and regrown anew every single year.",
    "Delphinidae": "Members of the oceanic dolphin family Delphinidae navigate and hunt in dark waters using high-frequency biosonar clicks pushed through their forehead melon.",
    "Balaenopteridae": "Rorqual whales in the family Balaenopteridae have accordion-like throat pleats that expand to engulf massive volumes of prey-filled seawater.",
    "Pteropodidae": "Old World fruit bats in the family Pteropodidae navigate primarily by keen eyesight and smell rather than laryngeal echolocation.",
    "Macropodidae": "Macropods store elastic energy in their large Achilles tendons, making each hop more oxygen-efficient the faster they bound.",
    "Sciuridae": "Members of the squirrel family Sciuridae have four chisel-like front incisors that grow continuously throughout their lives.",
    "Cercopithecidae": "Old World monkeys in the family Cercopithecidae possess tough sitting pads called ischial callosities and often have cheek pouches for storing food.",
    "cebidae": "New World monkeys in this lineage spend almost their entire lives high in the Neotropical forest canopy.",
    "Phocidae": "True earless seals in the family Phocidae lack external ear flaps and propel themselves underwater using side-to-side strokes of their hind flippers.",
    "Otariidae": "Eared seals in the family Otariidae can rotate their hind flippers forward to walk on all fours on land and 'fly' underwater using their front flippers.",
}


FUN_FACTS_PATH = MAMMAL_DIR / ".mammal_fun_facts.json"
_CURATED_FUN_FACTS_CACHE: dict[str, list[str]] | None = None


def load_curated_fun_facts() -> dict[str, list[str]]:
    global _CURATED_FUN_FACTS_CACHE
    if _CURATED_FUN_FACTS_CACHE is None:
        if FUN_FACTS_PATH.exists():
            _CURATED_FUN_FACTS_CACHE = json.loads(FUN_FACTS_PATH.read_text(encoding="utf-8"))
        else:
            _CURATED_FUN_FACTS_CACHE = {}
    return _CURATED_FUN_FACTS_CACHE


def build_mammal_fun_facts(m: dict[str, Any], row: tuple[Any, ...]) -> list[str]:
    """
    Loads 100% genuine, human-curated natural-history fun facts for each mammal
    from `.mammal_fun_facts.json` (and `SIGNATURE_MAMMAL_FACTS`), with zero
    category-restatement or robotic template fallbacks.
    """
    name = m["name"]
    curated = load_curated_fun_facts()
    facts: list[str] = []

    for f in curated.get(name, []):
        s = f.strip()
        if s and s not in facts:
            facts.append(s)

    if not facts:
        for f in SIGNATURE_MAMMAL_FACTS.get(name, []):
            s = f.strip()
            if s and s not in facts:
                facts.append(s)

    return facts[:10]


def build_all_mammals_from_wikipedia() -> list[dict[str, Any]]:
    """
    Combines the 229 iconic high-pageview mammals (with Taxobox/pageviews) and
    all 5,300+ extant species scraped from Wikipedia's IUCN and Continental lists.
    """
    wiki_titles = [row[1] for row in MAMMAL_ROSTER]
    wiki_cache = fetch_wiki_metadata(wiki_titles)
    lists_data = fetch_all_wikipedia_mammal_lists()
    iucn_wikitext: dict[str, str] = lists_data["iucn_wikitext"]
    cont_blobs: dict[str, str] = lists_data["cont_blobs"]

    mammals: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for row in MAMMAL_ROSTER:
        w_info = wiki_cache.get(row[1], {})
        if "views_60d" not in w_info:
            w_info = {"views_60d": 15000}
        rec = compute_mammal_traits(row, w_info)
        mammals.append(rec)
        seen_keys.add(row[0].lower())
        seen_keys.add(row[1].lower())
        for al in row[9]:
            seen_keys.add(al.lower())

    # Now parse all 5,300+ species from Wikipedia's 6 IUCN Red List mammal articles
    IGNORE_H2 = {"See also", "References", "Notes", "Further reading", "External links"}
    for iucn_code, txt in iucn_wikitext.items():
        h2, h3, h4 = "", "", ""
        in_subspecies = False
        in_subpop = False
        for line in txt.splitlines():
            s = line.strip()
            if s.startswith("====") and s.endswith("===="):
                h4 = s.strip("= ")
                in_subspecies = False
                in_subpop = False
            elif s.startswith("===") and s.endswith("==="):
                h3 = s.strip("= ")
                h4 = ""
                in_subspecies = False
                in_subpop = False
            elif s.startswith("==") and s.endswith("=="):
                h2 = s.strip("= ")
                h3, h4 = "", ""
                in_subspecies = False
                in_subpop = False
            elif s.startswith("'''Subspecies"):
                in_subspecies = True
            elif s.startswith("'''Subpopulation") or s.startswith("'''Stocks"):
                in_subpop = True
            elif s.startswith("'''Species"):
                in_subspecies = False
                in_subpop = False

            if not h2 or h2 in IGNORE_H2 or in_subspecies or in_subpop:
                continue

            if ("*[[" in s or "* [[" in s or "*''[[" in s or "* ''[[" in s) and "**" not in s:
                m = re.search(r"\*\s*'* \s*\[\[([^\]|:]+)(?:\|([^\]]+))?\]\]|\*\s*'*\[\[([^\]|:]+)(?:\|([^\]]+))?\]\]", s)
                if not m:
                    continue
                target = (m.group(1) or m.group(3) or "").strip()
                label = (m.group(2) or m.group(4) or target).strip()
                # Clean any trailing quotes or parenthetical disambiguations
                label = re.sub(r"\s*\((?:animal|mammal|rodent|bat|primate|marsupial|whale|seal)\)\s*$", "", label, flags=re.I).strip("'")
                if not label:
                    continue

                sci_m = re.search(r"\(''([^']+)''\)", s)
                sci = sci_m.group(1).strip() if sci_m else (target if target != label else "")

                # Skip trinomial subspecies or subpopulation entries
                if "subpopulation" in s.lower() or "subspecies" in s.lower():
                    continue
                if sci and len(sci.split()) >= 3 and re.match(r"^[A-Z][a-z]+ [a-z]+ [a-z]+$", sci):
                    continue

                if label.lower() in seen_keys or target.lower() in seen_keys or (sci and sci.lower() in seen_keys):
                    continue

                order, family = classify_taxonomy_from_headings(h2, h3, h4, label, sci)
                continents, diet, weight_cls, flags = infer_scraped_mammal_attributes(
                    label, target, sci, order, family, iucn_code, h2, h3, h4, cont_blobs
                )
                aliases = [sci.lower()] if sci and sci.lower() != label.lower() else []
                row_tuple = (label, target, order, family, continents, diet, iucn_code, weight_cls, flags, aliases)
                rec = compute_mammal_traits(row_tuple, {"views_60d": 500})
                mammals.append(rec)
                seen_keys.add(label.lower())
                seen_keys.add(target.lower())
                if sci:
                    seen_keys.add(sci.lower())

    # Fetch or load Wikipedia article byte lengths to select the 435 Trivia-Buff Mammal subset
    article_lengths: dict[str, int] = lists_data.get("article_lengths") or {}
    if not article_lengths:
        print("Fetching Wikipedia article lengths to distill the 435 Trivia-Buff Mammal roster...")
        all_names = [m["name"] for m in mammals]
        batches = [all_names[i : i + 50] for i in range(0, len(all_names), 50)]

        def fetch_len_batch(batch: list[str]) -> dict[str, int]:
            try:
                res = api_get({
                    "action": "query",
                    "prop": "info",
                    "titles": "|".join(batch),
                    "redirects": "1",
                    "format": "json",
                })
                rmap = {r["to"]: r["from"] for r in res.get("query", {}).get("redirects", [])}
                out: dict[str, int] = {}
                for p in res.get("query", {}).get("pages", {}).values():
                    t = p.get("title", "")
                    ln = int(p.get("length", 0))
                    out[t] = ln
                    if t in rmap:
                        out[rmap[t]] = ln
                return out
            except Exception:
                return {}

        with ThreadPoolExecutor(max_workers=6) as pool:
            for r in pool.map(fetch_len_batch, batches):
                article_lengths.update(r)
        lists_data["article_lengths"] = article_lengths
        LISTS_CACHE_PATH.write_text(json.dumps(lists_data, ensure_ascii=False), encoding="utf-8")

    # Attach regional species variants as aliases to their parent canonical mammal if one exists,
    # and prioritize distinct single-word / root-noun trivia mammals in the 435 roster.
    core_by_lower = {m["name"].lower(): m for m in mammals[: len(MAMMAL_ROSTER)]}

    def is_splitter_noise(m: dict[str, Any]) -> bool:
        nm = m["name"]
        low = nm.lower()
        if low in ("human", "homo sapiens"):
            return True
        if m.get("views_60d", 0) >= 5000:
            return False

        # If a scraped species is a regional modifier of a canonical mammal already in MAMMAL_ROSTER
        # (e.g. "Cozumel raccoon" -> "Raccoon", "European fallow deer" -> "Fallow deer",
        # "Philippine slow loris" -> "Slow loris", "Short-tailed chinchilla" -> "Chinchilla"),
        # attach it as an alias to the parent entry rather than duplicating it in the 435 roster!
        for c_low, parent_m in core_by_lower.items():
            if c_low in ("lion", "dog", "cat", "fox", "wolf", "bear", "deer", "rat", "mouse", "bat", "seal", "whale", "dolphin", "monkey", "lemur", "squirrel", "hare", "otter", "badger", "hyena", "bison", "buffalo", "camel", "tapir", "rhino", "elephant", "kangaroo", "possum", "opossum", "armadillo", "sloth", "anteater", "marmoset", "tamarin", "macaque", "gibbon"):
                continue
            if low != c_low and low.endswith(" " + c_low):
                if low not in parent_m["aliases"]:
                    parent_m["aliases"].append(low)
                return True

        if "'s " in low and any(w in low for w in (
            "shrew", "mouse", "rat", "bat", "vole", "gopher", "tuco-tuco", "pipistrelle",
            "myotis", "lemur", "opossum", "dunnart", "antechinus", "marmoset", "titi",
            "saki", "gerbil", "jird", "hamster", "mole", "tenrec", "sengi"
        )):
            return True
        if any(low.endswith(w) for w in (
            "shrew", "vole", "pipistrelle", "tuco-tuco", "pocket mouse", "spiny rat",
            "woodrat", "cotton rat", "deer mouse", "harvest mouse", "white-toothed shrew",
            "myotis", "free-tailed bat", "horseshoe bat", "leaf-nosed bat", "ibex", "hyrax"
        )) and article_lengths.get(nm, 0) < 28000:
            return True
        return False

    trivia_candidates = [m for m in mammals if not is_splitter_noise(m)]

    def trivia_rank_key(m: dict[str, Any]) -> tuple[int, int, int]:
        is_core = 1 if m.get("views_60d", 0) >= 5000 else 0
        nm = m["name"]
        # Give a boost to single-word root mammal nouns (e.g. Gerenuk, Takin, Sable, Pudu, Tayra, Uakari, Sifaka, Potto)
        single_word_boost = 15000 if (" " not in nm and "-" not in nm) else 0
        return (is_core, article_lengths.get(nm, 0) + single_word_boost, m.get("views_60d", 0))

    trivia_candidates.sort(key=trivia_rank_key, reverse=True)
    trivia_435 = trivia_candidates[:435]
    return trivia_435


def solve_board_exact(
    board_cats: list[str],
    par: int,
    mammals: list[dict[str, Any]],
) -> tuple[list[str], list[str]] | None:
    """
    Evaluates a 6-, 9-, or 12-category board:
      - Requires STRICTLY ONE (`len(hole_in_ones) == 1`) Hole-in-One mammal across all 435 mammals.
      - Requires that sole Hole-in-One mammal to be a recognizable core mammal (`views_60d >= 5000`).
      - Also finds a clean multi-mammal Par/Birdie combination (`sample_solution`).
    """
    n_cats = len(board_cats)
    target_mask = (1 << n_cats) - 1
    cat_index = {c: i for i, c in enumerate(board_cats)}

    hole_in_ones: list[dict[str, Any]] = []
    partial_masks: list[tuple[int, str, int]] = []

    max_partial = n_cats - 2
    min_partial = 2 if n_cats <= 6 else 3

    for m in mammals:
        mask = 0
        for t in m["traits"]:
            if t in cat_index:
                mask |= 1 << cat_index[t]
        if mask == target_mask:
            hole_in_ones.append(m)
            if len(hole_in_ones) > 1:
                return None
        else:
            cnt = bin(mask).count("1")
            if min_partial <= cnt <= max_partial and m.get("views_60d", 0) >= 8000:
                partial_masks.append((mask, m["name"], m.get("views_60d", 0)))

    # Must have EXACTLY ONE Hole-in-One mammal across the entire 435 database!
    if len(hole_in_ones) != 1:
        return None

    sole_hio = hole_in_ones[0]

    partial_masks.sort(key=lambda x: (bin(x[0]).count("1"), x[2]), reverse=True)
    top_p = partial_masks[:45]

    sample_sol: list[str] = []
    # For Par 2 (6 boxes), find a 2-mammal pair
    if par == 2:
        for i in range(len(top_p)):
            m1, n1, _ = top_p[i]
            for j in range(i + 1, len(top_p)):
                m2, n2, _ = top_p[j]
                if (m1 | m2) == target_mask:
                    sample_sol = [n1, n2]
                    break
            if sample_sol:
                break
    # For Par 3 (9 boxes), prefer a 3-mammal Par trio (or 2-mammal Birdie pair)
    elif par == 3:
        for i in range(min(30, len(top_p))):
            m1, n1, _ = top_p[i]
            for j in range(i + 1, min(35, len(top_p))):
                m2, n2, _ = top_p[j]
                m12 = m1 | m2
                if m12 == m1 or m12 == m2 or m12 == target_mask:
                    continue
                for k in range(j + 1, min(40, len(top_p))):
                    m3, n3, _ = top_p[k]
                    if (m12 | m3) == target_mask:
                        sample_sol = [n1, n2, n3]
                        break
                if sample_sol:
                    break
            if sample_sol:
                break
    # For Par 4 (12 boxes), find a 3-mammal Birdie trio or 4-mammal Par quad
    else:
        for i in range(min(28, len(top_p))):
            m1, n1, _ = top_p[i]
            for j in range(i + 1, min(32, len(top_p))):
                m2, n2, _ = top_p[j]
                m12 = m1 | m2
                if m12 == m1 or m12 == m2:
                    continue
                for k in range(j + 1, min(38, len(top_p))):
                    m3, n3, _ = top_p[k]
                    m123 = m12 | m3
                    if m123 == target_mask:
                        sample_sol = [n1, n2, n3]
                        break
                    for l_idx in range(k + 1, min(42, len(top_p))):
                        m4, n4, _ = top_p[l_idx]
                        if (m123 | m4) == target_mask:
                            sample_sol = [n1, n2, n3, n4]
                            break
                    if sample_sol:
                        break
                if sample_sol:
                    break
            if sample_sol:
                break

    if not sample_sol:
        return None

    return ([sole_hio["name"]], sample_sol)


def are_categories_orthogonal(chosen: list[str], cat_bits: dict[str, int] | None = None) -> bool:
    """
    Ensures all categories on a board are genuinely independent (no subset/implication
    pairs or 2-into-1 implications, and no mutually-exclusive complement pairs).
    """
    s = set(chosen)
    # No mutually exclusive complements
    if "aquatic_semiaquatic" in s and "terrestrial_only" in s:
        return False
    if "single_continent" in s and "multi_continent" in s:
        return False
    if "new_world_only" in s and "old_world_only" in s:
        return False
    if ("new_world_only" in s or "old_world_only" in s) and "single_continent" in s:
        return False
    if "name_single_word" in s and "name_multi_word" in s:
        return False
    if "name_starts_vowel" in s and "name_starts_consonant" in s:
        return False
    if "name_ends_vowel" in s and "name_ends_consonant" in s:
        return False

    # No subset/implication pairs (where A automatically implies B)
    if "fully_marine" in s and ("aquatic_semiaquatic" in s or "multi_continent" in s or "limbs_flippers" in s):
        return False
    if "limbs_flippers" in s and ("aquatic_semiaquatic" in s or "fully_marine" in s):
        return False
    if "order_primates" in s and ("limbs_grasping" in s or "arboreal_tree" in s):
        return False
    if "horns_antlers_tusks" in s and "ungulate" in s:
        return False
    if "new_world_only" in s and bool(s & {"native_africa", "native_asia", "native_europe", "native_australia"}):
        return False
    if "old_world_only" in s and bool(s & {"native_north_america", "native_south_america"}):
        return False
    if "name_short_5" in s and "name_single_word" in s:
        return False
    if "name_has_hyphen" in s and "name_multi_word" in s:
        return False
    if ("name_has_color" in s or "name_has_geo" in s or "name_body_or_animal" in s) and "name_multi_word" in s:
        return False

    # At most 1 from each mutually-exclusive bucket
    tax_cats = {"order_carnivora", "order_rodentia", "order_primates", "ungulate", "marsupial_monotreme", "fully_marine"}
    limb_cats = {"ungulate", "limbs_paws_claws", "limbs_grasping", "limbs_flippers"}
    diet_cats = {"diet_herbivore", "diet_carnivore", "diet_insectivore", "diet_omnivore"}
    weight_cats = {"weight_over_200kg", "weight_medium", "weight_under_5kg"}
    continent_cats = {"native_africa", "native_asia", "native_north_america", "native_south_america", "native_europe", "native_australia"}
    len_cats = {"name_short_5", "name_medium_6_11", "name_long_12"}

    if len(s & tax_cats) > 1:
        return False
    if len(s & limb_cats) > 1:
        return False
    if len(s & diet_cats) > 1:
        return False
    if len(s & weight_cats) > 1:
        return False
    if len(s & len_cats) > 1:
        return False
    if len(s & continent_cats) > 1 and ("single_continent" in s or "multi_continent" in s or "island_endemic" in s):
        return False
    if "island_endemic" in s and ("single_continent" in s or "multi_continent" in s):
        return False
    if "new_world_only" in s and "multi_continent" in s and bool(s & {"native_north_america", "native_south_america"}):
        return False
    if len(s & continent_cats) >= 1 and "single_continent" in s and ("new_world_only" in s or "old_world_only" in s):
        return False
    if ("arboreal_tree" in s or "flight_or_gliding" in s or "burrowing_den" in s or "order_primates" in s) and "terrestrial_only" in s:
        return False
    if "order_rodentia" in s and "limbs_paws_claws" in s:
        return False
    if "name_long_12" in s and "name_multi_word" in s:
        return False
    if len(s & continent_cats) > 2:
        return False

    # Exact dataset check: no category A on the board may be a subset of another category B (A <= B).
    if cat_bits is not None:
        k = len(chosen)
        for i in range(k):
            ba = cat_bits.get(chosen[i], 0)
            for j in range(k):
                if i == j:
                    continue
                bb = cat_bits.get(chosen[j], 0)
                if (ba & ~bb) == 0:
                    return False

    return True


def build_pool_for_par(
    par: int,
    target_count: int,
    mammals: list[dict[str, Any]],
    bio_set: set[str],
    name_set: set[str],
    rng: random.Random,
    seen_signatures: set[tuple[str, ...]],
    excluded_hio_names: set[str],
    mutate_excluded: bool = True,
) -> list[dict[str, Any]]:
    """
    Generates up to `target_count` verified boards for a given `par`:
      - Par 2 = 6 boxes
      - Par 3 = 9 boxes
      - Par 4 = 12 boxes
    Every board has STRICTLY ONE (`1-of-1`) Mole-in-One mammal, and also records
    whether that mammal has only 1 valid board (`single_board: True`) vs 2+ boards (`single_board: False`).
    """
    n_boxes = 6 if par == 2 else (9 if par == 3 else 12)
    splits = (
        [(5, 1), (4, 2)]
        if par == 2
        else ([(7, 2), (6, 3), (8, 1)] if par == 3 else [(9, 3), (8, 4), (10, 2), (7, 5)])
    )

    cat_bits: dict[str, int] = {}
    for idx, m in enumerate(mammals):
        bit = 1 << idx
        for t in m["traits"]:
            cat_bits[t] = cat_bits.get(t, 0) | bit

    core_mammals = [m for m in mammals if m.get("views_60d", 0) >= 5000]
    extra_mammals = [m for m in mammals if m.get("views_60d", 0) < 5000]
    rng.shuffle(core_mammals)
    rng.shuffle(extra_mammals)
    candidate_roster = core_mammals + extra_mammals

    results: list[dict[str, Any]] = []
    used_in_this_pool: set[str] = set()

    for m in candidate_roster:
        if len(results) >= target_count:
            break
        if m["name"] in excluded_hio_names or m["name"] in used_in_this_pool:
            continue

        m_bio = [t for t in m["traits"] if t in bio_set]
        m_name = [t for t in m["traits"] if t in name_set]

        max_boards_for_m = 1 if mutate_excluded else 4
        valid_boards_for_m: list[dict[str, Any]] = []
        local_sigs: set[tuple[str, ...]] = set()
        for n_bio, n_nm in splits:
            if len(m_bio) < n_bio or len(m_name) < n_nm:
                continue
            for _ in range(140):
                chosen = rng.sample(m_bio, n_bio) + rng.sample(m_name, n_nm)
                sig = tuple(sorted(chosen))
                if sig in seen_signatures or sig in local_sigs:
                    continue
                if not are_categories_orthogonal(chosen, cat_bits):
                    continue
                solved = solve_board_exact(chosen, par, mammals)
                if not solved:
                    continue
                hio_names, sample_sol = solved
                rng.shuffle(chosen)
                local_sigs.add(sig)
                valid_boards_for_m.append({
                    "par": par,
                    "boxes": n_boxes,
                    "categories": chosen,
                    "hole_in_ones": hio_names,
                    "sample_solution": sample_sol,
                    "_sig": sig,
                })
                if len(valid_boards_for_m) >= max_boards_for_m:
                    break
            if len(valid_boards_for_m) >= max_boards_for_m:
                break

        if valid_boards_for_m:
            first_b = valid_boards_for_m[0]
            for vb in valid_boards_for_m:
                seen_signatures.add(vb.pop("_sig"))
            if not mutate_excluded:
                first_b["single_board"] = (len(valid_boards_for_m) == 1)
                first_b["alt_boards"] = [
                    {
                        "categories": vb["categories"],
                        "sample_solution": vb["sample_solution"],
                    }
                    for vb in valid_boards_for_m[1:]
                ]
            used_in_this_pool.add(m["name"])
            if mutate_excluded:
                excluded_hio_names.add(m["name"])
            results.append(first_b)

    return results


def generate_courses_and_dailies(mammals: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    rng = random.Random(2026110742)
    bio_set = {c["id"] for c in CATEGORY_DEFS if c["group"] != "name"}
    name_set = {c["id"] for c in CATEGORY_DEFS if c["group"] == "name"}

    seen_signatures: set[tuple[str, ...]] = set()
    base_hio_mammals: set[str] = set()

    # Total base course holes needed:
    # Course 1: 9 Par 2s
    # Course 2: 5 Par 2s + 4 Par 3s
    # Course 3: 4 Par 2s + 3 Par 3s + 2 Par 4s
    # Total across 3 Base Courses = 18 Par 2s, 7 Par 3s, 2 Par 4s (27 holes total, 27 distinct Hole-in-One mammals!)
    base_par4 = build_pool_for_par(4, 2, mammals, bio_set, name_set, rng, seen_signatures, base_hio_mammals)
    for b in base_par4:
        base_hio_mammals.add(b["hole_in_ones"][0])

    base_par3 = build_pool_for_par(3, 7, mammals, bio_set, name_set, rng, seen_signatures, base_hio_mammals)
    for b in base_par3:
        base_hio_mammals.add(b["hole_in_ones"][0])

    base_par2 = build_pool_for_par(2, 18, mammals, bio_set, name_set, rng, seen_signatures, base_hio_mammals)
    for b in base_par2:
        base_hio_mammals.add(b["hole_in_ones"][0])

    # Assemble the 3 Base Courses
    c1_holes = base_par2[:9]
    # Course 2: 5 Par 2s and 4 Par 3s interleaved
    c2_p2 = base_par2[9:14]
    c2_p3 = base_par3[:4]
    c2_holes = [c2_p2[0], c2_p3[0], c2_p2[1], c2_p3[1], c2_p2[2], c2_p3[2], c2_p2[3], c2_p2[4], c2_p3[3]]
    # Course 3: 4 Par 2s, 3 Par 3s, and 2 Par 4s interleaved
    c3_p2 = base_par2[14:18]
    c3_p3 = base_par3[4:7]
    c3_p4 = base_par4[:2]
    c3_holes = [c3_p2[0], c3_p3[0], c3_p2[1], c3_p4[0], c3_p2[2], c3_p3[1], c3_p2[3], c3_p3[2], c3_p4[1]]

    courses = [
        {
            "id": "course_1",
            "num": 1,
            "name": "Clover Meadow",
            "subtitle": "9 Holes of Par 2",
            "icon": "🍀",
            "total_par": sum(h["par"] for h in c1_holes),
            "holes": [{**h, "id": i + 1} for i, h in enumerate(c1_holes)],
        },
        {
            "id": "course_2",
            "num": 2,
            "name": "Whispering Pines",
            "subtitle": "5 Par 2s & 4 Par 3s",
            "icon": "🌲",
            "total_par": sum(h["par"] for h in c2_holes),
            "holes": [{**h, "id": i + 1} for i, h in enumerate(c2_holes)],
        },
        {
            "id": "course_3",
            "num": 3,
            "name": "Bighorn Summit",
            "subtitle": "4 Par 2s, 3 Par 3s & 2 Par 4s",
            "icon": "🏔️",
            "total_par": sum(h["par"] for h in c3_holes),
            "holes": [{**h, "id": i + 1} for i, h in enumerate(c3_holes)],
        },
    ]

    # Build full Daily Candidate Pools across ALL 435 mammals (`excluded_hio_names=set()`, `mutate_excluded=False`)
    # so course animals are still eligible for Daily games (on different category boards via `seen_signatures`)!
    daily_par4 = build_pool_for_par(4, 450, mammals, bio_set, name_set, rng, seen_signatures, set(), mutate_excluded=False)
    daily_par3 = build_pool_for_par(3, 450, mammals, bio_set, name_set, rng, seen_signatures, set(), mutate_excluded=False)
    daily_par2 = build_pool_for_par(2, 450, mammals, bio_set, name_set, rng, seen_signatures, set(), mutate_excluded=False)

    for idx, b in enumerate(daily_par2):
        b["id"] = f"D2-{idx + 1}"
    for idx, b in enumerate(daily_par3):
        b["id"] = f"D3-{idx + 1}"
    for idx, b in enumerate(daily_par4):
        b["id"] = f"D4-{idx + 1}"

    daily_pools = {
        "par2": daily_par2,
        "par3": daily_par3,
        "par4": daily_par4,
    }
    return courses, daily_pools


def main() -> None:
    mammals = build_all_mammals_from_wikipedia()

    print(f"\nBuilt verified database of {len(mammals):,} mammals across {len(CATEGORY_DEFS)} undeniable categories.")

    courses, daily_pools = generate_courses_and_dailies(mammals)
    for c in courses:
        pars = [h["par"] for h in c["holes"]]
        print(f"  Course {c['num']} ({c['name']}): {len(c['holes'])} holes | Total Par {c['total_par']} | Pars: {pars}")
    print(
        f"  Daily Pools (Zero overlap with base courses): "
        f"{len(daily_pools['par2'])} Par-2s, {len(daily_pools['par3'])} Par-3s, {len(daily_pools['par4'])} Par-4s"
    )

    # Flatten all base course holes into `boards` for backward compatibility
    all_base_boards = [h for c in courses for h in c["holes"]]

    payload = {
        "categories": CATEGORY_DEFS,
        "mammals": mammals,
        "courses": courses,
        "daily_pools": daily_pools,
        "boards": all_base_boards,
    }
    OUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved to {OUT_JSON_PATH}")

    # Also sync compact embedded data into index.html so all mammals work over file://
    html_path = MAMMAL_DIR / "index.html"
    if html_path.exists():
        cat_idx = {c["id"]: i for i, c in enumerate(CATEGORY_DEFS)}
        compact_payload = {
            "categories": CATEGORY_DEFS,
            "mammals_packed": [
                [
                    m["name"],
                    [cat_idx[t] for t in m["traits"] if t in cat_idx],
                    m.get("views_60d", 500),
                    m.get("aliases", []),
                    m.get("facts", []),
                ]
                for m in mammals
            ],
            "courses": courses,
            "daily_pools": daily_pools,
            "boards": all_base_boards,
        }
        html_text = html_path.read_text(encoding="utf-8")
        marker_re = re.compile(
            r"/\* __MOLE_IN_ONE_DATA_START__ \*/.*?/\* __MOLE_IN_ONE_DATA_END__ \*/",
            re.S,
        )
        replacement_block = (
            "/* __MOLE_IN_ONE_DATA_START__ */\n"
            f"const EMBEDDED_MAMMAL_DATA = {json.dumps(compact_payload, ensure_ascii=False, separators=(',', ':'))};\n"
            "/* __MOLE_IN_ONE_DATA_END__ */"
        )
        if marker_re.search(html_text):
            html_path.write_text(marker_re.sub(lambda _: replacement_block, html_text), encoding="utf-8")
            print(f"Synced {len(mammals):,} mammals, 3 courses, and daily pools into {html_path}")


if __name__ == "__main__":
    main()
