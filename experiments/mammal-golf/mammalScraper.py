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
OUT_JSON_PATH = MAMMAL_DIR / "mammal_golf.json"

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
    ("House mouse", "House mouse", "Rodentia", "Muridae", ["AS", "EU"], "O", "LC", "S", "", ["mouse", "field mouse", "mus musculus"]),
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
    # Taxonomy
    {"id": "order_carnivora",        "group": "taxonomy",     "name": "Order Carnivora",            "desc": "Member of the mammal order Carnivora (cats, dogs, bears, weasels, seals, raccoons, hyenas, civets, etc.)"},
    {"id": "family_felidae",         "group": "taxonomy",     "name": "Cat Family (Felidae)",       "desc": "Member of the biological family Felidae (true cats)"},
    {"id": "family_canidae",         "group": "taxonomy",     "name": "Dog Family (Canidae)",       "desc": "Member of the biological family Canidae (wolves, foxes, jackals, dogs)"},
    {"id": "order_rodentia",         "group": "taxonomy",     "name": "Rodent (Order Rodentia)",    "desc": "Member of the order Rodentia (gnawing mammals with continuously growing incisors)"},
    {"id": "order_primates",         "group": "taxonomy",     "name": "Primate (Order Primates)",   "desc": "Member of the order Primates (apes, monkeys, lemurs, tarsiers, lorises, bushbabies)"},
    {"id": "ungulate",               "group": "taxonomy",     "name": "Hoofed Mammal (Ungulate)",   "desc": "Hoofed land mammal (even-toed and odd-toed ungulates with hooves)"},
    {"id": "odd_toed_ungulate",      "group": "taxonomy",     "name": "Odd-Toed Ungulate",          "desc": "Member of order Perissodactyla (horses, zebras, asses, rhinos, tapirs)"},
    {"id": "marsupial_monotreme",    "group": "taxonomy",     "name": "Marsupial or Monotreme",     "desc": "Pouched mammal (marsupial) or egg-laying mammal (monotreme)"},
    {"id": "fully_marine",           "group": "taxonomy",     "name": "Marine Mammal",              "desc": "Ocean-dwelling mammal (whales, dolphins, porpoises, seals, sea lions, walrus, manatees, dugong, sea otter)"},

    # Geography
    {"id": "native_africa",          "group": "geography",    "name": "Native to Africa",           "desc": "Has a native wild population on the African continent or Madagascar"},
    {"id": "native_asia",            "group": "geography",    "name": "Native to Asia",             "desc": "Has a native wild population in Asia"},
    {"id": "native_north_america",   "group": "geography",    "name": "Native to North America",    "desc": "Has a native wild population in North or Central America / Caribbean"},
    {"id": "native_south_america",   "group": "geography",    "name": "Native to South America",    "desc": "Has a native wild population in South America"},
    {"id": "native_europe",          "group": "geography",    "name": "Native to Europe",           "desc": "Has a native wild population in Europe"},
    {"id": "native_australia",       "group": "geography",    "name": "Native to Australia/Oceania","desc": "Has a native wild population in Australia, Tasmania, New Guinea, or Oceania"},
    {"id": "single_continent",       "group": "geography",    "name": "Endemic to 1 Continent",     "desc": "Found natively on only a single continent (excluding oceanic whales/seals)"},
    {"id": "multi_continent",        "group": "geography",    "name": "Multi-Continent / Oceanic",  "desc": "Found natively across 2+ continents or across the world's oceans"},

    # Diet, Anatomy & Ecology
    {"id": "diet_herbivore",         "group": "biology",      "name": "Strictly Herbivorous",       "desc": "Plant-eating mammal (grazer, browser, frugivore, folivore, or granivore)"},
    {"id": "diet_carnivore",         "group": "biology",      "name": "Vertebrate Predator",        "desc": "Primarily hunts and eats other vertebrate animals (meat or fish)"},
    {"id": "diet_insectivore",       "group": "biology",      "name": "Insectivore / Ant-Eater",    "desc": "Diet consists primarily of insects, ants, termites, or small invertebrates"},
    {"id": "diet_omnivore",          "group": "biology",      "name": "Omnivorous Diet",            "desc": "Eats both plant and animal matter (bears, raccoons, pigs, chimps, baboons, foxes, badgers, opossums, rats)"},
    {"id": "horns_antlers_tusks",    "group": "biology",      "name": "Horns, Antlers, or Tusks",   "desc": "Possesses true horns, antlers, ossicones, rhino horns, or projecting tusks"},
    {"id": "aquatic_semiaquatic",    "group": "biology",      "name": "Aquatic or Semi-Aquatic",    "desc": "Swims and forages in water (marine mammals, otters, beavers, hippos, capybaras, platypus, water shrews/voles)"},
    {"id": "terrestrial_only",       "group": "biology",      "name": "Strictly Land-Dwelling",     "desc": "Terrestrial or arboreal mammal (not aquatic or semi-aquatic)"},
    {"id": "stripes_or_spots",       "group": "biology",      "name": "Striped or Spotted Coat",    "desc": "Has prominent coat stripes, spots, bands, or rosettes"},
    {"id": "flight_or_gliding",      "group": "biology",      "name": "Flies or Glides",            "desc": "Capable of true powered flight (bats) or membrane gliding (flying squirrels, gliders, colugos)"},
    {"id": "weight_over_200kg",      "group": "biology",      "name": "Heavyweight (>200 kg / 440 lb)", "desc": "Adults regularly exceed 200 kg (440 lbs) in body mass"},
    {"id": "weight_medium",          "group": "biology",      "name": "Medium-Sized (5–200 kg)",    "desc": "Adults weigh between 5 kg (11 lbs) and 200 kg (440 lbs)"},
    {"id": "weight_under_5kg",       "group": "biology",      "name": "Pint-Sized (<5 kg / 11 lb)", "desc": "Adults weigh under 5 kg (11 lbs)"},

    # Name / Lexical Traits
    {"id": "name_has_color",         "group": "name",         "name": "Color in Common Name",       "desc": "Common name contains a color word (Red, Black, White, Blue, Gray, Brown, Golden, Yellow, Silver)"},
    {"id": "name_has_geo",           "group": "name",         "name": "Place/Habitat in Name",      "desc": "Common name contains a place or habitat word (African, Asian, American, Arctic, Mountain, Sea, River, Forest, Desert, etc.)"},
    {"id": "name_double_letter",     "group": "name",         "name": "Double Letter in Name",      "desc": "Common name contains consecutive identical letters (e.g., Giraffe, Cheetah, Gorilla, Otter, Moose)"},
    {"id": "name_starts_vowel",      "group": "name",         "name": "Starts with a Vowel",        "desc": "Common name begins with A, E, I, O, or U"},
    {"id": "name_short_5",           "group": "name",         "name": "5-Letter (or Shorter) Name", "desc": "Single-word common name with 5 letters or fewer (e.g., Lion, Tiger, Zebra, Horse, Moose, Koala, Orca, Sloth, Ibex, Hyrax)"},
    {"id": "name_single_word",       "group": "name",         "name": "Single-Word Name",           "desc": "Common name is a single unhyphenated word (e.g., Giraffe, Capybara, Platypus, Wolverine, Ibex, Hyrax)"},
    {"id": "name_multi_word",        "group": "name",         "name": "Multi-Word Name",            "desc": "Common name consists of two or more words (e.g., Polar bear, Sea otter, Red panda, Snow leopard, Blue whale)"},
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

    # 1. Taxonomy
    if order == "Carnivora":
        traits.append("order_carnivora")
    if family == "Felidae":
        traits.append("family_felidae")
    if family == "Canidae":
        traits.append("family_canidae")
    if order == "Rodentia":
        traits.append("order_rodentia")
    if order == "Primates":
        traits.append("order_primates")
    if "U" in flags:
        traits.append("ungulate")
    if order == "Perissodactyla":
        traits.append("odd_toed_ungulate")
    if "P" in flags:
        traits.append("marsupial_monotreme")
    if "M" in flags:
        traits.append("fully_marine")

    # 2. Geography
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

    # 3. Diet, Anatomy & Ecology
    if diet == "H":
        traits.append("diet_herbivore")
    elif diet == "C":
        traits.append("diet_carnivore")
    elif diet == "I":
        traits.append("diet_insectivore")
    else:
        traits.append("diet_omnivore")

    if "H" in flags:
        traits.append("horns_antlers_tusks")
    if "A" in flags or "M" in flags:
        traits.append("aquatic_semiaquatic")
    else:
        traits.append("terrestrial_only")
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
    name_low = name.lower()
    if color_re.search(name_low):
        traits.append("name_has_color")
    if geo_re.search(name_low):
        traits.append("name_has_geo")
    if double_re.search(name_low):
        traits.append("name_double_letter")
    if name_low and name_low[0] in "aeiou":
        traits.append("name_starts_vowel")
    if " " not in name_low and "-" not in name_low and len(name_low) <= 5:
        traits.append("name_short_5")
    if " " in name_low or "-" in name_low:
        traits.append("name_multi_word")
    else:
        traits.append("name_single_word")

    return {
        "name": name,
        "aliases": aliases,
        "order": order,
        "family": family,
        "iucn": iucn,
        "views_60d": wiki_info.get("views_60d", 500),
        "summary": wiki_info.get("extract", ""),
        "traits": traits,
    }


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


def solve_board_6cat(
    board_cats: list[str],
    mammals: list[dict[str, Any]],
) -> tuple[list[str], list[str]] | None:
    """
    Evaluates a 6-category board:
      - Finds all Hole-in-One mammals (1 mammal clears all 6 categories).
      - Requires at least 1 well-known mammal (`views_60d >= 5000` or single-word classic)
        among the Hole-in-Ones, and at most 6 total Hole-in-Ones so the snipe feels special.
      - Also finds a clean 2-mammal Par-2 pair (where each mammal clears 3–4 categories).
    """
    target_mask = (1 << len(board_cats)) - 1
    cat_index = {c: i for i, c in enumerate(board_cats)}

    hole_in_ones: list[dict[str, Any]] = []
    partial_masks: list[tuple[int, str, int]] = []

    for m in mammals:
        mask = 0
        for t in m["traits"]:
            if t in cat_index:
                mask |= 1 << cat_index[t]
        cnt = bin(mask).count("1")
        if mask == target_mask:
            hole_in_ones.append(m)
        elif 2 <= cnt <= 4 and m.get("views_60d", 0) >= 8000:
            partial_masks.append((mask, m["name"], m.get("views_60d", 0)))

    if not hole_in_ones or len(hole_in_ones) > 6:
        return None

    # Ensure at least one recognizable mammal can Hole-in-One the board
    well_known_hio = [m for m in hole_in_ones if m.get("views_60d", 0) >= 8000]
    if not well_known_hio:
        return None

    # Order hole_in_ones with the most recognizable first
    hole_in_ones.sort(key=lambda m: m.get("views_60d", 0), reverse=True)
    hio_names = [m["name"] for m in hole_in_ones]

    # Find a clean 2-mammal Par-2 combination from partial_masks
    partial_masks.sort(key=lambda x: (bin(x[0]).count("1"), x[2]), reverse=True)
    par2_pair: list[str] = []
    for i in range(min(40, len(partial_masks))):
        m1, n1, _ = partial_masks[i]
        for j in range(i + 1, min(50, len(partial_masks))):
            m2, n2, _ = partial_masks[j]
            if (m1 | m2) == target_mask:
                par2_pair = [n1, n2]
                break
        if par2_pair:
            break

    if not par2_pair:
        return None

    return (hio_names, par2_pair)


def are_categories_orthogonal(chosen: list[str]) -> bool:
    """
    Ensures all 6 categories on a board are genuinely independent (no subset/implication
    pairs and no mutually-exclusive complement pairs).
    """
    s = set(chosen)
    # No mutually exclusive complements
    if "aquatic_semiaquatic" in s and "terrestrial_only" in s:
        return False
    if "single_continent" in s and "multi_continent" in s:
        return False
    if "name_single_word" in s and "name_multi_word" in s:
        return False

    # No subset/implication pairs (where A automatically implies B)
    if "fully_marine" in s and ("aquatic_semiaquatic" in s or "multi_continent" in s):
        return False
    if ("family_felidae" in s or "family_canidae" in s) and "order_carnivora" in s:
        return False
    if "family_felidae" in s and "diet_carnivore" in s:
        return False
    if "odd_toed_ungulate" in s and ("ungulate" in s or "diet_herbivore" in s):
        return False
    if "horns_antlers_tusks" in s and "ungulate" in s:
        return False
    if "name_short_5" in s and "name_single_word" in s:
        return False
    if "name_has_color" in s and "name_multi_word" in s:
        return False
    if "name_has_geo" in s and "name_multi_word" in s:
        return False

    # At most 1 taxonomy category, at most 1 diet category, at most 1 weight category
    tax_cats = {"order_carnivora", "family_felidae", "family_canidae", "order_rodentia", "order_primates", "ungulate", "odd_toed_ungulate", "marsupial_monotreme", "fully_marine"}
    diet_cats = {"diet_herbivore", "diet_carnivore", "diet_insectivore", "diet_omnivore"}
    weight_cats = {"weight_over_200kg", "weight_medium", "weight_under_5kg"}
    continent_cats = {"native_africa", "native_asia", "native_north_america", "native_south_america", "native_europe", "native_australia"}

    if len(s & tax_cats) > 1:
        return False
    if len(s & diet_cats) > 1:
        return False
    if len(s & weight_cats) > 1:
        return False
    if len(s & continent_cats) > 1 and "single_continent" in s:
        return False
    if len(s & continent_cats) > 2:
        return False

    return True


def generate_golf_boards(mammals: list[dict[str, Any]], count: int = 30) -> list[dict[str, Any]]:
    rng = random.Random(20261106)
    bio_cats = [c["id"] for c in CATEGORY_DEFS if c["group"] != "name"]
    name_cats = [c["id"] for c in CATEGORY_DEFS if c["group"] == "name"]

    boards: list[dict[str, Any]] = []
    seen_signatures: set[tuple[str, ...]] = set()
    used_primary_hio: set[str] = set()

    attempts = 0
    while len(boards) < count and attempts < 12000:
        attempts += 1
        # 5 biology/taxonomy/geography clues + 1 name clue = 6 categories (3x2 grid)
        chosen = rng.sample(bio_cats, 5) + rng.sample(name_cats, 1)
        sig = tuple(sorted(chosen))
        if sig in seen_signatures:
            continue
        if not are_categories_orthogonal(chosen):
            continue

        solved = solve_board_6cat(chosen, mammals)
        if not solved:
            continue
        hio_names, par2_pair = solved

        # Ensure every board features a distinct lead Hole-in-One mammal
        if hio_names[0] in used_primary_hio and attempts < 8000:
            continue

        seen_signatures.add(sig)
        used_primary_hio.add(hio_names[0])
        rng.shuffle(chosen)
        boards.append({
            "id": len(boards) + 1,
            "par": 2,
            "categories": chosen,
            "hole_in_ones": hio_names,
            "sample_solution": par2_pair,
        })

    return boards


def main() -> None:
    mammals = build_all_mammals_from_wikipedia()

    print(f"\nBuilt verified database of {len(mammals):,} mammals across {len(CATEGORY_DEFS)} undeniable categories:")
    for c in CATEGORY_DEFS:
        cnt = sum(1 for m in mammals if c["id"] in m["traits"])
        print(f"  - {c['name']:<32} ({c['group']:<12}): {cnt:4d} mammals")

    boards = generate_golf_boards(mammals, count=30)
    print(f"\nGenerated {len(boards)} verified 6-Category (3x2) Golf Boards (Par 2, with 1-Stroke Hole-in-One):")
    for b in boards[:8]:
        hios = ", ".join(b["hole_in_ones"][:3])
        par2 = ", ".join(b["sample_solution"])
        print(f"  Board #{b['id']:2d} | Par {b['par']} | Hole-in-One: {hios:<38} | Par 2: {par2}")

    payload = {
        "categories": CATEGORY_DEFS,
        "mammals": mammals,
        "boards": boards,
    }
    OUT_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved to {OUT_JSON_PATH}")

    # Also sync compact embedded data into index.html so all mammals work over file://
    html_path = MAMMAL_DIR / "index.html"
    if html_path.exists():
        cat_idx = {c["id"]: i for i, c in enumerate(CATEGORY_DEFS)}
        # Use bitmask `m` for traits so 5,200+ mammals fit in ~280KB inside mammal-golf.html
        compact_payload = {
            "categories": CATEGORY_DEFS,
            "mammals_packed": [
                [
                    m["name"],
                    [cat_idx[t] for t in m["traits"] if t in cat_idx],
                    m.get("views_60d", 500),
                    m.get("aliases", []),
                ]
                for m in mammals
            ],
            "boards": boards,
        }
        html_text = html_path.read_text(encoding="utf-8")
        marker_re = re.compile(
            r"/\* __MAMMAL_GOLF_DATA_START__ \*/.*?/\* __MAMMAL_GOLF_DATA_END__ \*/",
            re.S,
        )
        replacement_block = (
            "/* __MAMMAL_GOLF_DATA_START__ */\n"
            f"const EMBEDDED_MAMMAL_DATA = {json.dumps(compact_payload, ensure_ascii=False, separators=(',', ':'))};\n"
            "/* __MAMMAL_GOLF_DATA_END__ */"
        )
        if marker_re.search(html_text):
            html_path.write_text(marker_re.sub(lambda _: replacement_block, html_text), encoding="utf-8")
            print(f"Synced {len(mammals):,} mammals into {html_path}")


if __name__ == "__main__":
    main()
