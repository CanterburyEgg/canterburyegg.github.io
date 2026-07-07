import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Raw data from user
raw_data = """
Stratton United	Prime	Wolfgang Koch	14	23	13
Stratton United	Prime	Antoine Gauthier	25	9	0
Stratton United	Prime	Gustavo Techera	24	10	0
Stratton United	Prime	Christian Janssen	5	10	25
Stratton United	Prime	Edgar Jimenez	13	17	10
Stratton United	Prime	Dayot Hernandez	9	17	9
Stratton United	Prime	Gonzalo Machado	5	8	23
Stratton United	Prime	Trevor Shaw	5	6	20
Stratton United	Prime	Saïd Djaloud	0	0	0
Haverford Black	Prime	Dragan Petrovic	28	8	0
Haverford Black	Prime	Andrew Moore	26	9	0
Haverford Black	Prime	Jurgen Richter	13	19	11
Haverford Black	Prime	Jaime Riquelme	5	12	26
Haverford Black	Prime	Jose Lopes	0	0	0
Haverford Black	Prime	Theo Tchouameni	5	12	24
Haverford Black	Prime	Ko Kamada	11	18	10
Haverford Black	Prime	Charles Stewart	7	15	8
Haverford Black	Prime	Murray Campbell	5	7	21
Stella Grey	Prime	Kwon Seung-Hyeok	27	10	0
Stella Grey	Prime	Park Hyeon-Bin	27	9	0
Stella Grey	Prime	Stephen Hunt	0	0	0
Stella Grey	Prime	Wilhelm Schafer	5	11	29
Stella Grey	Prime	Clive Jones	5	11	27
Stella Grey	Prime	Gilberto Delgado	10	17	12
Stella Grey	Prime	Salisu Abdul Samed	12	17	7
Stella Grey	Prime	Gideon Seidu	5	10	20
Stella Grey	Prime	Juan Apaza	9	15	5
Chateau Roux	Prime	Gustavo Suarez	28	10	0
Chateau Roux	Prime	Diego Castillo	26	8	0
Chateau Roux	Prime	Lisandro Romero	10	20	11
Chateau Roux	Prime	Pierre Blanchard	0	0	0
Chateau Roux	Prime	Bailey Myers-Morgan	11	19	11
Chateau Roux	Prime	Casey Myers-Morgan	10	16	15
Chateau Roux	Prime	Jeroen de Jong	5	8	26
Chateau Roux	Prime	Marcel Verhoeven	5	11	17
Chateau Roux	Prime	Claude Timmermans	5	8	20
Glass Castle FC	Prime	Richard van der Heijden	29	13	0
Glass Castle FC	Prime	Marco Alvarez	26	14	0
Glass Castle FC	Prime	Ekanit Yooyen	0	0	0
Glass Castle FC	Prime	Marc Watkins	14	17	13
Glass Castle FC	Prime	Zeljko Vukevic	9	18	13
Glass Castle FC	Prime	Manfred Fischer	5	7	24
Glass Castle FC	Prime	Nigel Price	5	7	24
Glass Castle FC	Prime	Hans Weber	5	6	21
Glass Castle FC	Prime	Francisco Rodrigues	7	18	5
Thurston FC East	Prime	Bernard Michel	13	24	9
Thurston FC East	Prime	Nigel Maharaj	14	18	11
Thurston FC East	Prime	Adrian Llewellyn	14	17	11
Thurston FC East	Prime	Vitor Correia	5	9	26
Thurston FC East	Prime	Hernan Torres	23	9	0
Thurston FC East	Prime	Mbaye Cisse	5	8	24
Thurston FC East	Prime	Theo de Boer	21	8	0
Thurston FC East	Prime	Brahima Kamagate	0	0	0
Thurston FC East	Prime	Terence Kane	5	7	19
Thurston FC West	Prime	Vincent van de Velde	16	19	7
Thurston FC West	Prime	Antonio Rudiger	5	12	26
Thurston FC West	Prime	Ramon Perdomo	11	18	16
Thurston FC West	Prime	Thierry Payet	9	19	13
Thurston FC West	Prime	Conor O'Sullivan	24	7	0
Thurston FC West	Prime	Patrick Murray	25	3	0
Thurston FC West	Prime	Vicente Salazar	0	0	0
Thurston FC West	Prime	Martijn van den Berg	5	11	20
Thurston FC West	Prime	Benoit Rousseau	5	11	18
Eisenwald 1900	Prime	Sergio Baez	10	25	14
Eisenwald 1900	Prime	Valeriu Florea	27	4	0
Eisenwald 1900	Prime	Stuart Holmes	15	19	7
Eisenwald 1900	Prime	Carlos Acosta	25	7	0
Eisenwald 1900	Prime	Radu Dragomir	0	0	0
Eisenwald 1900	Prime	Rene Chevalier	5	11	25
Eisenwald 1900	Prime	Fabian Gomez	8	16	14
Eisenwald 1900	Prime	Gavin Powell	5	9	21
Eisenwald 1900	Prime	Karl Meier	5	9	19
Askhatansa	Prime	Jean-Pierre de Clercq	29	12	0
Askhatansa	Prime	Neil Griffith	26	10	0
Askhatansa	Prime	Vicente Acuna	0	0	0
Askhatansa	Prime	Peter Meijer	14	17	9
Askhatansa	Prime	Desmond Bonnet	9	17	12
Askhatansa	Prime	Roy Foster	7	15	13
Askhatansa	Prime	Vu Hung Dung	5	4	29
Askhatansa	Prime	Hiroshi Itakura	5	12	18
Askhatansa	Prime	Young-gwon Hwang	5	13	19
Cheicester City	Prime	Olivier Rousseau	29	14	0
Cheicester City	Prime	Dominique Girard	28	6	0
Cheicester City	Prime	Jean Gauthier	5	11	27
Cheicester City	Prime	Marcel Kuiper	0	0	0
Cheicester City	Prime	Jeremie Frimpong	11	20	9
Cheicester City	Prime	Elias Matsimbe	11	19	10
Cheicester City	Prime	Clive Moore	5	10	23
Cheicester City	Prime	Declan Burke	5	4	23
Cheicester City	Prime	Floyd Adebayor	6	16	8
Barroclaugh Athletic	Prime	Jiri Novakova	0	0	0
Barroclaugh Athletic	Prime	Manuel Castillo	24	7	0
Barroclaugh Athletic	Prime	Marcos Aguilar	25	4	0
Barroclaugh Athletic	Prime	Amadou Onana	14	16	17
Barroclaugh Athletic	Prime	Krzysztof Sikora	5	11	24
Barroclaugh Athletic	Prime	Denis Chevalier	9	19	12
Barroclaugh Athletic	Prime	Timothy Theate	5	15	19
Barroclaugh Athletic	Prime	Manaraii Wagemann	5	14	18
Barroclaugh Athletic	Prime	Jamie Price	13	14	10
Havenpoort FC	Prime	Jacques Lemaire	12	25	15
Havenpoort FC	Prime	Ruben Schar	11	20	11
Havenpoort FC	Prime	Kalidou Koulibaly	10	19	13
Havenpoort FC	Prime	Alain Goossens	28	6	0
Havenpoort FC	Prime	Mickael Caron	24	10	0
Havenpoort FC	Prime	Mario Morales	0	0	0
Havenpoort FC	Prime	Esteban Maidana	5	6	22
Havenpoort FC	Prime	Denis Kizito	5	10	18
Havenpoort FC	Prime	Andritany Dimas	5	4	21
Les Brasseurs	Prime	Craig Young	25	9	0
Les Brasseurs	Prime	Sven Sjoberg	0	0	0
Les Brasseurs	Prime	Edmond Toska	27	5	0
Les Brasseurs	Prime	Mitchell Duke	11	18	14
Les Brasseurs	Prime	Yannick Barbier	11	17	16
Les Brasseurs	Prime	Edwin Ruiz	11	20	6
Les Brasseurs	Prime	Hernando Orozco	5	12	24
Les Brasseurs	Prime	Ramon Medina	5	11	18
Les Brasseurs	Prime	Marcos Paz	5	8	22
Corsaires de Calais	Prime	Gerhard Muller	27	9	0
Corsaires de Calais	Prime	Jan van Dijk	27	8	0
Corsaires de Calais	Prime	Eddy van den Broeck	0	0	0
Corsaires de Calais	Prime	Ramos Marrero	12	16	15
Corsaires de Calais	Prime	Richard Lemaire	5	12	25
Corsaires de Calais	Prime	Ollie Rice	5	14	20
Corsaires de Calais	Prime	Adrian Walsh	5	10	25
Corsaires de Calais	Prime	Johan Post	6	16	9
Corsaires de Calais	Prime	Luis Gallese	13	15	6
Stedham Journeymen	Prime	Joao Pereira	25	13	0
Stedham Journeymen	Prime	Eamon Murphy	8	19	15
Stedham Journeymen	Prime	Stefan Winter	13	19	9
Stedham Journeymen	Prime	Mohamed Alaoui	27	6	0
Stedham Journeymen	Prime	Wilmer Paz	0	0	0
Stedham Journeymen	Prime	Pieter van Vliet	12	18	9
Stedham Journeymen	Prime	Craig Henderson	5	6	28
Stedham Journeymen	Prime	Moses Okeke	5	13	17
Stedham Journeymen	Prime	Harry Souttar	5	6	22
Celtic Cross FC	Prime	Colin Pugh	27	7	0
Celtic Cross FC	Prime	Marc Renard	17	17	13
Celtic Cross FC	Prime	Kenneth Wright	0	0	0
Celtic Cross FC	Prime	Leslie Knight	23	13	0
Celtic Cross FC	Prime	Darren King	5	15	19
Celtic Cross FC	Prime	Federico Barella	7	18	14
Celtic Cross FC	Prime	Rob Brouwer	11	15	14
Celtic Cross FC	Prime	Geert Verhoeven	5	8	20
Celtic Cross FC	Prime	Philip Gibson	5	7	20
Imperiale Roma	Med	Rodrigo de Jesus	5	13	26
Imperiale Roma	Med	Ricardo de Los Santos	0	0	0
Imperiale Roma	Med	Felipe Contreras	30	7	0
Imperiale Roma	Med	Yuryi Melnyk	26	11	0
Imperiale Roma	Med	Kim Si-Yeon	7	19	15
Imperiale Roma	Med	Cristian Molina	5	12	24
Imperiale Roma	Med	Shojae Cheshmi	5	7	24
Imperiale Roma	Med	John Bugeja	8	16	7
Imperiale Roma	Med	Evangelos Mylonas	14	15	4
Castellano Madrid	Med	Carlos Pereira	17	25	11
Castellano Madrid	Med	Pavel Vesela	5	11	25
Castellano Madrid	Med	Fatmir Dervishi	27	7	0
Castellano Madrid	Med	Ahmed Mansouri	0	0	0
Castellano Madrid	Med	Francois Toussaint	25	10	0
Castellano Madrid	Med	Henrik Mikkelsen	5	10	24
Castellano Madrid	Med	Luan Murati	5	6	23
Castellano Madrid	Med	Pere Munoz	9	16	8
Castellano Madrid	Med	Felix Jradi	7	15	9
Al-Qahira FC	Med	Alvaro Chaves	29	9	0
Al-Qahira FC	Med	Ricardo Goncalves	28	9	0
Al-Qahira FC	Med	Josef Steiner	10	18	14
Al-Qahira FC	Med	Andres Rodriguez	5	11	26
Al-Qahira FC	Med	Neil Wright	0	0	0
Al-Qahira FC	Med	Jose Quispe	5	8	24
Al-Qahira FC	Med	Sherif Farouk	5	13	20
Al-Qahira FC	Med	Dejan Popovic	13	15	7
Al-Qahira FC	Med	Abdel Aziz Abid	5	17	9
Fursan al-Arab	Med	Joao Silva	29	11	0
Fursan al-Arab	Med	Rafael Delgado	5	15	25
Fursan al-Arab	Med	Cesar Aguero	27	6	0
Fursan al-Arab	Med	Sergio Gutierrez	0	0	0
Fursan al-Arab	Med	Jose Romero	5	11	24
Fursan al-Arab	Med	Eduardo Vaca	5	10	24
Fursan al-Arab	Med	Amir Zare	13	17	6
Fursan al-Arab	Med	Abdalla Eisa	8	16	9
Fursan al-Arab	Med	Rachid Tahiri	8	14	12
Catalonia Gothic	Med	Mario Sosa	9	24	16
Catalonia Gothic	Med	Albert Hall	27	6	0
Catalonia Gothic	Med	Arthur Kakuta	10	19	11
Catalonia Gothic	Med	Kyriacos Panayiotou	26	6	0
Catalonia Gothic	Med	Roberto Sosa	13	19	7
Catalonia Gothic	Med	Michele di Stefano	5	8	26
Catalonia Gothic	Med	Ljubomir Jovanovic	0	0	0
Catalonia Gothic	Med	Zuhair Hassan	5	8	21
Catalonia Gothic	Med	Karim Mohamed	5	10	19
Le Rocher Monaco	Med	Didier Diomande	27	8	0
Le Rocher Monaco	Med	Leandro Cordeiro	26	11	0
Le Rocher Monaco	Med	Alvaro Vazquez	13	19	6
Le Rocher Monaco	Med	Salvatore Moretti	8	20	7
Le Rocher Monaco	Med	Enrique Ortega	0	0	0
Le Rocher Monaco	Med	Alejandro Garcia	11	14	19
Le Rocher Monaco	Med	Mohamed Benyahia	5	9	23
Le Rocher Monaco	Med	Ilir Hoxha	5	6	25
Le Rocher Monaco	Med	Bassel Haidar	5	13	20
Barbary Apes	Med	Klaus Bauer	0	0	0
Barbary Apes	Med	Mustapha Hakimi	13	19	12
Barbary Apes	Med	Svein Berg	26	9	0
Barbary Apes	Med	Tahnoon Ramadan	25	10	0
Barbary Apes	Med	Ramazan Yilmaz	5	10	25
Barbary Apes	Med	Jovan Trajkovic	12	19	10
Barbary Apes	Med	Med Mansour	9	17	11
Barbary Apes	Med	Abdel Allah	5	9	20
Barbary Apes	Med	Amar Touati	5	7	22
Olympias Athena	Med	Luis Aguirre	0	0	0
Olympias Athena	Med	Thomas Martin	26	11	0
Olympias Athena	Med	Slobodan Kovacevic	25	11	0
Olympias Athena	Med	Aissa Bounedjah	14	18	11
Olympias Athena	Med	Huseyin Sahin	8	16	15
Olympias Athena	Med	Alidu Mensah	12	17	8
Olympias Athena	Med	Arthur Coelho	5	10	22
Olympias Athena	Med	Ali Al-Ahbabi	5	8	23
Olympias Athena	Med	Savvas Constantinou	5	9	21
Bosphorus Blue	Med	Giovanni Rossi	25	12	0
Bosphorus Blue	Med	Roberjt Grgic	15	23	15
Bosphorus Blue	Med	Petr Navratil	12	17	13
Bosphorus Blue	Med	Hilal Maatouk	22	11	0
Bosphorus Blue	Med	Gabriel Magalhaes	11	18	10
Bosphorus Blue	Med	Rabih El Zein	0	0	0
Bosphorus Blue	Med	Salaah Al-Yahyaei	5	7	21
Bosphorus Blue	Med	Faisal Almarri	5	4	22
Bosphorus Blue	Med	Ebrahim Al-Aswad	5	8	19
Visconti Serpents	Med	Sergio Alves	14	27	17
Visconti Serpents	Med	Manoel Ribiero	29	8	0
Visconti Serpents	Med	Mehdi Khalil	24	11	0
Visconti Serpents	Med	Reza Jafari	0	0	0
Visconti Serpents	Med	Marcelo Majer	5	6	24
Visconti Serpents	Med	Shahid Khan	12	15	9
Visconti Serpents	Med	Georges Béaruné	6	17	8
Visconti Serpents	Med	Ammar Sabbag	5	8	21
Visconti Serpents	Med	Joe Waine	5	8	21
Lisbon United	Med	Giovanni Ricci	26	7	0
Lisbon United	Med	Marcelo da Silva	12	30	5
Lisbon United	Med	Sergio Martino	25	6	0
Lisbon United	Med	Francesco Caruso	5	10	25
Lisbon United	Med	Gerardo Perez	10	19	15
Lisbon United	Med	Pedro Huaman	0	0	0
Lisbon United	Med	Stjepan Novosel	5	6	25
Lisbon United	Med	Dimitrios Papadopoulos	5	6	21
Lisbon United	Med	German Salazar	12	16	9
Lions of Carthage	Med	Niko Lovric	31	12	0
Lions of Carthage	Med	Ivica Vidovic	27	13	0
Lions of Carthage	Med	Amr Shehab	0	0	0
Lions of Carthage	Med	Giuseppe Giordano	5	9	27
Lions of Carthage	Med	Shabaib Al-Dhefiri	5	11	21
Lions of Carthage	Med	Moulaye Guidileye	9	17	8
Lions of Carthage	Med	Ahmed Salah	5	5	26
Lions of Carthage	Med	Arshad Yadav	9	17	8
Lions of Carthage	Med	Komail Al-Aswad	9	16	10
Najm al-Bayda	Med	Dario Blanco	29	6	0
Najm al-Bayda	Med	Vicente Garcia	28	6	0
Najm al-Bayda	Med	Mario Appindangoyé	0	0	0
Najm al-Bayda	Med	Teboho Tau	10	22	4
Najm al-Bayda	Med	Walid Harit	8	17	17
Najm al-Bayda	Med	Jefferson Uribe	5	13	22
Najm al-Bayda	Med	Mehmet Celik	5	14	21
Najm al-Bayda	Med	Hassan Ataya	10	16	10
Najm al-Bayda	Med	Victor-Manuel Aguilar	5	6	26
Alexandria Faros	Med	Patricio Torres	13	27	12
Alexandria Faros	Med	Ali Mousavi	28	6	0
Alexandria Faros	Med	Alvaro Viera	11	20	13
Alexandria Faros	Med	Freddy Lopez	26	9	0
Alexandria Faros	Med	German Arias	0	0	0
Alexandria Faros	Med	Amine Ounahi	5	8	23
Alexandria Faros	Med	Gian Selva	5	8	22
Alexandria Faros	Med	Zlatko Novak	5	4	22
Alexandria Faros	Med	Agustin Lara	7	18	8
Damascus Steel	Med	Ahmed Saleh	0	0	0
Damascus Steel	Med	Yusuf Guler	26	7	0
Damascus Steel	Med	Salah Saidi	26	6	0
Damascus Steel	Med	Fabrice Blanchard	5	14	22
Damascus Steel	Med	Nestor Moreira	5	14	20
Damascus Steel	Med	Andres Molina	5	10	24
Damascus Steel	Med	Malcolm Hopkins	11	17	10
Damascus Steel	Med	Didier Bouanga	15	15	11
Damascus Steel	Med	Ramesh Shrestha	7	17	13
Tripoli Sporting	Med	Juan Rivera	27	7	0
Tripoli Sporting	Med	Fahad Ali	24	11	0
Tripoli Sporting	Med	Andrej Kos	0	0	0
Tripoli Sporting	Med	Said Taleb	14	18	9
Tripoli Sporting	Med	Stavros Giannopoulos	12	19	8
Tripoli Sporting	Med	Abo Samir	8	18	13
Tripoli Sporting	Med	Milan Mitrovic	5	8	25
Tripoli Sporting	Med	Amer Zaid	5	10	23
Tripoli Sporting	Med	Giampiero Suriani	5	9	22
Moscow Krepost	Euro	Soren Holm	12	24	16
Moscow Krepost	Euro	Zoran Ilic	14	20	7
Moscow Krepost	Euro	Kristjan Jonsson	10	19	12
Moscow Krepost	Euro	Ilija Hodzic	5	11	23
Moscow Krepost	Euro	Niels Jensen	25	6	0
Moscow Krepost	Euro	Arnaldo Benitez	24	7	0
Moscow Krepost	Euro	Zoran Atanasov	0	0	0
Moscow Krepost	Euro	Laszlo Kovacs	5	5	22
Moscow Krepost	Euro	Lars Jonsson	5	8	20
Slavutych Kyiv	Euro	Pawel Lewandowski	28	6	0
Slavutych Kyiv	Euro	Maksim Volkova	26	11	0
Slavutych Kyiv	Euro	Tomislav Rakic	0	0	0
Slavutych Kyiv	Euro	Zoltan Kocsis	13	20	7
Slavutych Kyiv	Euro	Nykolai Moroz	5	9	27
Slavutych Kyiv	Euro	Franz Ospelt	8	20	10
Slavutych Kyiv	Euro	Jesper Thomsen	5	10	25
Slavutych Kyiv	Euro	Heikki Laine	5	6	25
Slavutych Kyiv	Euro	Algimantas Zilinskas	10	18	6
Edelweiss Zurich	Euro	Simon Knight	30	7	0
Edelweiss Zurich	Euro	Marcos Ospina	24	11	0
Edelweiss Zurich	Euro	Miroslav Pavlovic	0	0	0
Edelweiss Zurich	Euro	Pavel Ivanova	5	12	25
Edelweiss Zurich	Euro	Aka Dah	12	18	10
Edelweiss Zurich	Euro	Erik Olsen	5	13	22
Edelweiss Zurich	Euro	Anders Lindstrom	10	17	8
Edelweiss Zurich	Euro	Fredrik Johansson	9	16	10
Edelweiss Zurich	Euro	Slobodan Krstic	5	6	25
Stockholm United	Euro	Florin Stan	27	12	0
Stockholm United	Euro	Jan Prochazka	25	9	0
Stockholm United	Euro	Vyktor Kovalenko	12	20	12
Stockholm United	Euro	Rolf Schulze	0	0	0
Stockholm United	Euro	Andrzej Nowak	9	17	14
Stockholm United	Euro	Lucas Luiz	5	12	23
Stockholm United	Euro	Darius Balciunas	5	6	24
Stockholm United	Euro	Viktor Morozov	5	8	21
Stockholm United	Euro	Jovan Stojanovski	12	16	6
Oslo Vikinger	Euro	Andreas Wyss	29	10	0
Oslo Vikinger	Euro	Orlando Cardona	26	14	0
Oslo Vikinger	Euro	Serhei Tkachenko	0	0	0
Oslo Vikinger	Euro	Park Jun-Seo	5	7	27
Oslo Vikinger	Euro	Odilon Gradel	5	8	26
Oslo Vikinger	Euro	Petar Stojanovic	5	11	21
Oslo Vikinger	Euro	Aleksandr Kuznetsov	11	18	6
Oslo Vikinger	Euro	Gheorghe Cristea	10	16	10
Oslo Vikinger	Euro	Constantin Prodan	9	16	10
Donau Wien	Euro	Stefan Takac	28	6	0
Donau Wien	Euro	Franc Potocnik	23	14	0
Donau Wien	Euro	Jan Johansen	11	20	12
Donau Wien	Euro	Rafael Parra	12	18	14
Donau Wien	Euro	Cieran McCormick	0	0	0
Donau Wien	Euro	Werner Frei	11	18	9
Donau Wien	Euro	Vasile Cazacu	5	9	22
Donau Wien	Euro	Arni Olafsson	5	9	21
Donau Wien	Euro	Pedro Dos Santos	5	6	22
Dunav Belgrade	Euro	Kjell Nilsen	26	11	0
Dunav Belgrade	Euro	Vitaliy Zabarnyi	9	20	13
Dunav Belgrade	Euro	Vasylyi Yvanova	11	21	5
Dunav Belgrade	Euro	Raul Morales	25	4	0
Dunav Belgrade	Euro	Ari Korhonen	14	16	13
Dunav Belgrade	Euro	Piotr Nowicki	0	0	0
Dunav Belgrade	Euro	Gerhard Bauer	5	9	24
Dunav Belgrade	Euro	Ernest Nuamah	5	9	22
Dunav Belgrade	Euro	Marko Bosnjak	5	10	23
Sisu Helsinki	Euro	Ivan Popova	27	12	0
Sisu Helsinki	Euro	Mathieu Lefevre	27	6	0
Sisu Helsinki	Euro	Aleksandr Olyinyk	5	8	26
Sisu Helsinki	Euro	Bojan Kavcic	5	10	26
Sisu Helsinki	Euro	Krasimi Georgiev	0	0	0
Sisu Helsinki	Euro	Andrey Zaitsev	6	24	6
Sisu Helsinki	Euro	Emilio Segundo	5	8	24
Sisu Helsinki	Euro	Pascal Ferreira	9	16	13
Sisu Helsinki	Euro	Stefan Meier	16	16	5
Kongens FC	Euro	Jens Clausen	0	0	0
Kongens FC	Euro	Arvydas Vasiliauskas	24	9	0
Kongens FC	Euro	Mauricio Rios	22	13	0
Kongens FC	Euro	Istvan Kiss	12	17	12
Kongens FC	Euro	Jani Rasanen	16	17	7
Kongens FC	Euro	Valentin Ionescu	11	17	11
Kongens FC	Euro	Ladislav Kovac	5	7	27
Kongens FC	Euro	Daniel Wohlwend	5	9	22
Kongens FC	Euro	Fernando Ribiero	5	11	21
Bohemian Gryphons	Euro	Georgios Nikolaidis	25	12	0
Bohemian Gryphons	Euro	Sandor Toth	26	10	0
Bohemian Gryphons	Euro	Eero Salo	0	0	0
Bohemian Gryphons	Euro	Thomas Anderson	11	16	15
Bohemian Gryphons	Euro	Rolf Bachmann	5	11	24
Bohemian Gryphons	Euro	Stojan Petrovska	9	16	13
Bohemian Gryphons	Euro	Kairat Kichin	5	8	23
Bohemian Gryphons	Euro	Valerijs Priede	14	15	7
Bohemian Gryphons	Euro	Giorgio Chellini	5	12	18
Korona Warsaw	Euro	Janos Meszaros	0	0	0
Korona Warsaw	Euro	Slobodan Radic	27	7	0
Korona Warsaw	Euro	Vaclav Dvorak	27	7	0
Korona Warsaw	Euro	Tomasz Zajac	5	6	30
Korona Warsaw	Euro	Karl Olsson	5	8	28
Korona Warsaw	Euro	Branko Novac	11	21	7
Korona Warsaw	Euro	Bajram Sylejmani	9	20	9
Korona Warsaw	Euro	Aleksandr Kallas	11	19	7
Korona Warsaw	Euro	Marcel Roth	5	12	19
Magyar Huszar	Euro	Faïz Bachirou	26	10	0
Magyar Huszar	Euro	Stoyan Nikolov	25	11	0
Magyar Huszar	Euro	Robson Medeiros	0	0	0
Magyar Huszar	Euro	Hector Alvarez	5	12	22
Magyar Huszar	Euro	Moussa Amani	13	16	12
Magyar Huszar	Euro	Ammar Krouma	9	20	5
Magyar Huszar	Euro	Jiang Linpeng	12	15	15
Magyar Huszar	Euro	Edwin Torrez	5	5	25
Magyar Huszar	Euro	Veselin Ivanov	5	11	21
Bucharest International	Euro	Frantisek Molnar	28	10	0
Bucharest International	Euro	Karl Mayer	26	10	0
Bucharest International	Euro	Hadisi Aengari	0	0	0
Bucharest International	Euro	Marcel Wagner	5	8	27
Bucharest International	Euro	Pansa Kaman	11	19	9
Bucharest International	Euro	Jacek Majewski	10	14	16
Bucharest International	Euro	Rafael Jimenez	5	12	19
Bucharest International	Euro	Lalaina Amada	10	18	7
Bucharest International	Euro	Peeter Ots	5	9	22
Sarajevo Grad	Euro	Caio Sultan	26	6	0
Sarajevo Grad	Euro	Antanas Zukauskas	25	6	0
Sarajevo Grad	Euro	Markus Schneider	0	0	0
Sarajevo Grad	Euro	Azamat Zemlianukhin	11	18	12
Sarajevo Grad	Euro	Johann Gunnarsson	5	13	25
Sarajevo Grad	Euro	Hamid Bagheri	5	13	23
Sarajevo Grad	Euro	Paweł Bednarek	5	12	21
Sarajevo Grad	Euro	Juraj Szabo	9	18	6
Sarajevo Grad	Euro	Georgios Christofi	14	14	13
Reykjavik Isbjorn	Euro	Akhtam Jalilov	27	11	0
Reykjavik Isbjorn	Euro	Gunnar Bjornsson	26	13	0
Reykjavik Isbjorn	Euro	Mo Diallo	0	0	0
Reykjavik Isbjorn	Euro	Marjan Krajnc	8	17	16
Reykjavik Isbjorn	Euro	Mitch Alick	5	11	23
Reykjavik Isbjorn	Euro	Joseph Wari	12	15	11
Reykjavik Isbjorn	Euro	Nigel Clarke	12	17	6
Reykjavik Isbjorn	Euro	Liviu Ciobanu	5	5	24
Reykjavik Isbjorn	Euro	Andreas Schwarz	5	11	20
Slavia Tatry	Euro	Martin Lang	0	0	0
Slavia Tatry	Euro	Felix Gallego	24	9	0
Slavia Tatry	Euro	Janis Berzins	24	10	0
Slavia Tatry	Euro	Michal Fialova	15	17	13
Slavia Tatry	Euro	Fouad Selemani	5	9	26
Slavia Tatry	Euro	Anton Zupan	5	15	17
Slavia Tatry	Euro	Carlo D'Amico	7	15	14
Slavia Tatry	Euro	Tomas Arias	15	13	12
Slavia Tatry	Euro	Alberto Diaz	5	12	18
New York Empire	Backyard	Nick Hamburger	29	12	0
New York Empire	Backyard	Raul Ortiz	11	19	12
New York Empire	Backyard	Helmut Lange	25	8	0
New York Empire	Backyard	Silas McBride	5	10	25
New York Empire	Backyard	Helgi Magnusson	8	17	13
New York Empire	Backyard	Miguel Ortega	5	8	23
New York Empire	Backyard	Tim Moore	0	0	0
New York Empire	Backyard	Lorenzo Marte	5	12	18
New York Empire	Backyard	Orlando Centeno	12	14	9
Los Angeles Syndicate	Backyard	Nicolae Popescu	26	9	0
Los Angeles Syndicate	Backyard	Nicolas Montero	25	9	0
Los Angeles Syndicate	Backyard	Pedro Flores	14	18	9
Los Angeles Syndicate	Backyard	Milan Marjanovic	9	18	15
Los Angeles Syndicate	Backyard	Dmitriy Shevchenko	0	0	0
Los Angeles Syndicate	Backyard	Sawyer Marshall	11	17	13
Los Angeles Syndicate	Backyard	Nicholas Persad	5	9	23
Los Angeles Syndicate	Backyard	Frantz Germaine	5	11	20
Los Angeles Syndicate	Backyard	Brandon Boyd	5	9	20
Las Vegas Mirage	Backyard	Mohammed Odoi	29	10	0
Las Vegas Mirage	Backyard	Nam Min-Jae	0	0	0
Las Vegas Mirage	Backyard	William Davies	11	20	11
Las Vegas Mirage	Backyard	Anthony Gonzales	25	8	0
Las Vegas Mirage	Backyard	Knox Fletcher	10	20	10
Las Vegas Mirage	Backyard	Antonio Chavez	5	7	27
Las Vegas Mirage	Backyard	Fernando Reyes	10	18	8
Las Vegas Mirage	Backyard	Johan Vasquez	5	9	22
Las Vegas Mirage	Backyard	Junya Ito	5	8	22
Chicago Surge	Backyard	Adriano Campos	29	8	0
Chicago Surge	Backyard	Juan Narvaez	5	12	26
Chicago Surge	Backyard	Joseph Clarke	29	6	0
Chicago Surge	Backyard	Jozsef Szabo	5	15	23
Chicago Surge	Backyard	Pedro Reis	0	0	0
Chicago Surge	Backyard	Terezinha Rocha	5	8	25
Chicago Surge	Backyard	James Delva	8	18	11
Chicago Surge	Backyard	Peter Ramirez	6	18	7
Chicago Surge	Backyard	Domingo Ordonez	13	15	8
Boston Rebellion	Backyard	Francisco Castillo	13	25	16
Boston Rebellion	Backyard	Javier Guerra	0	0	0
Boston Rebellion	Backyard	Sergio Almeida	11	20	10
Boston Rebellion	Backyard	Edward Gauthier	9	20	10
Boston Rebellion	Backyard	Sharaf El Hadi	26	8	0
Boston Rebellion	Backyard	Ben Ben Nabouhane	26	6	0
Boston Rebellion	Backyard	Jean-Philippe Saïko	5	6	23
Boston Rebellion	Backyard	Ernesto Cordoba	5	7	21
Boston Rebellion	Backyard	Brooks Hollister	5	8	20
Toronto Blizzard	Backyard	Adrian Johnson	15	17	11
Toronto Blizzard	Backyard	Brandon Vargas	12	17	14
Toronto Blizzard	Backyard	Tadashi Sato	0	0	0
Toronto Blizzard	Backyard	Jorge Quesada	9	19	10
Toronto Blizzard	Backyard	Jeyland Mitchell	5	8	26
Toronto Blizzard	Backyard	Juan-Carlos Novelo	25	7	0
Toronto Blizzard	Backyard	Mustafa Simsek	24	9	0
Toronto Blizzard	Backyard	Jacques Lavoie	5	13	20
Toronto Blizzard	Backyard	Ramon Bonilla	5	10	19
Mexico City Sol	Backyard	Cesar Paredes	29	6	0
Mexico City Sol	Backyard	Peter Buhler	26	11	0
Mexico City Sol	Backyard	Dexter Edwards	0	0	0
Mexico City Sol	Backyard	Evidence Tau	11	20	8
Mexico City Sol	Backyard	Zizo Fathi	5	8	30
Mexico City Sol	Backyard	Rowllin Singh	5	12	24
Mexico City Sol	Backyard	Marc Tremblay	7	19	6
Mexico City Sol	Backyard	Jean Roberts	12	15	9
Mexico City Sol	Backyard	Muaid Musrati	5	9	23
Seattle Echo	Backyard	Pedro Banegas	27	12	0
Seattle Echo	Backyard	Serghei Cojocari	26	10	0
Seattle Echo	Backyard	Alcides Cabrera	0	0	0
Seattle Echo	Backyard	Jaxson Wilder	11	19	11
Seattle Echo	Backyard	Juan Araya	5	9	24
Seattle Echo	Backyard	Enrique de Leon	5	11	22
Seattle Echo	Backyard	Enrique Blanco	11	16	13
Seattle Echo	Backyard	Tomasi Devi	10	15	10
Seattle Echo	Backyard	Gustavo Vega	5	8	20
Philadelphia Spirit	Backyard	Angel Cedeno	26	11	0
Philadelphia Spirit	Backyard	Victor Weaver	0	0	0
Philadelphia Spirit	Backyard	Walker Hayes	24	10	0
Philadelphia Spirit	Backyard	Manuel Gonçalves	14	15	16
Philadelphia Spirit	Backyard	Marlon Padilla	5	12	24
Philadelphia Spirit	Backyard	Musa Musa	8	18	7
Philadelphia Spirit	Backyard	Jorge Molina	13	17	5
Philadelphia Spirit	Backyard	Felix Rodriguez	5	8	26
Philadelphia Spirit	Backyard	Pedro Nsue	5	9	22
Dallas Flare	Backyard	Hector	28	12	0
Dallas Flare	Backyard	Diego Perez	27	7	0
Dallas Flare	Backyard	César Nyikeine	0	0	0
Dallas Flare	Backyard	Felipe Juarez	5	11	25
Dallas Flare	Backyard	Gabriel Juarez	10	19	8
Dallas Flare	Backyard	Manuel Amador	6	19	8
Dallas Flare	Backyard	Antoine Semenyo	14	14	13
Dallas Flare	Backyard	Hugo Rosas	5	8	24
Dallas Flare	Backyard	Tomas Morales	5	10	22
San Jose Relampago	Backyard	Jordan Amartey	27	11	0
San Jose Relampago	Backyard	Domingo Roldan	25	12	0
San Jose Relampago	Backyard	Inaki Kudus	0	0	0
San Jose Relampago	Backyard	Rafael Borré	11	16	18
San Jose Relampago	Backyard	Reinildo Dove	5	10	24
San Jose Relampago	Backyard	Jorge Sanchez	11	18	5
San Jose Relampago	Backyard	Edwin Lopez	11	16	10
San Jose Relampago	Backyard	Francis Baptiste	5	11	20
San Jose Relampago	Backyard	Hamza El Mehdi	5	6	23
Montreal Coureurs	Backyard	Matti Jokinen	26	7	0
Montreal Coureurs	Backyard	Santiago Barrios	24	10	0
Montreal Coureurs	Backyard	Cassius Reed	0	0	0
Montreal Coureurs	Backyard	Rafael Tejeda	13	18	9
Montreal Coureurs	Backyard	Vicente Mendez	12	16	16
Montreal Coureurs	Backyard	Wayne Harrison	10	18	7
Montreal Coureurs	Backyard	Arthur Kayembe	5	10	24
Montreal Coureurs	Backyard	Armando Dominguez	5	11	23
Montreal Coureurs	Backyard	Youssouf M'Changama	5	10	21
Tijuana Vaqueros	Backyard	Guadalupe Moreno	28	12	0
Tijuana Vaqueros	Backyard	Scott Robinson	29	5	0
Tijuana Vaqueros	Backyard	Ahmet Ozcan	0	0	0
Tijuana Vaqueros	Backyard	Rogelio Valencia	7	20	11
Tijuana Vaqueros	Backyard	Phil Schröck	10	19	11
Tijuana Vaqueros	Backyard	Liu Lei	5	9	26
Tijuana Vaqueros	Backyard	Kassaly Hainikoye	11	17	9
Tijuana Vaqueros	Backyard	Jaime Chavarria	5	8	22
Tijuana Vaqueros	Backyard	Carlos Vieira	5	10	21
Washington Justice	Backyard	Marc Sanon	0	0	0
Washington Justice	Backyard	Vojislav Milic	25	7	0
Washington Justice	Backyard	Spyridon Karagiannis	22	13	0
Washington Justice	Backyard	Guillaume Deschamps	5	10	24
Washington Justice	Backyard	Siyanda Zwane	5	14	21
Washington Justice	Backyard	Johan Charlier	17	14	14
Washington Justice	Backyard	Martin Patiño	5	12	20
Washington Justice	Backyard	Yukio Ono	12	16	8
Washington Justice	Backyard	Jonathan Carmichael	9	14	13
Detroit Firebirds	Backyard	Joel Hosein	28	5	0
Detroit Firebirds	Backyard	Neville Grant	26	9	0
Detroit Firebirds	Backyard	Mauricio Fuentes	0	0	0
Detroit Firebirds	Backyard	Felipe Pinheiro	11	20	10
Detroit Firebirds	Backyard	Felix Cardozo	5	11	22
Detroit Firebirds	Backyard	Cesar Romero	5	6	28
Detroit Firebirds	Backyard	Nico Soria	7	20	10
Detroit Firebirds	Backyard	Clyde Gittens	13	15	12
Detroit Firebirds	Backyard	Graham Chapman	5	14	18
Denver Torrent	Backyard	Edgar Rojas	0	0	0
Denver Torrent	Backyard	Geraldo Faife	26	12	0
Denver Torrent	Backyard	Hassan Mohammadi	25	11	0
Denver Torrent	Backyard	Javier Giraldo	5	8	29
Denver Torrent	Backyard	Abdoul Oumarou	5	12	22
Denver Torrent	Backyard	Kim Min-Jun	13	18	8
Denver Torrent	Backyard	Diego Correia	5	6	27
Denver Torrent	Backyard	Ricardo Mejia	9	17	6
Denver Torrent	Backyard	Hugh McAuley	12	16	8
"""

def inject():
    lines = [l.strip() for l in raw_data.strip().split('\n')]
    count = 0
    
    players_data = {} # (team, league) -> list of player dicts
    
    for line in lines:
        parts = line.split('\t')
        if len(parts) < 6: continue
        team, league, name, shot, ast, defen = parts
        key = (team, league)
        if key not in players_data: players_data[key] = []
        players_data[key].append({
            "name": name,
            "shot_prop": int(shot),
            "assist_prop": int(ast),
            "stop_prop": int(defen)
        })

    for (team, league), players in players_data.items():
        # Correct folder name for Backyard
        league_folder = "Backyard" if league == "Backyard" else league
        json_path = os.path.join(BASE_DIR, "Tournaments", "2025", league_folder, "Teams", f"{team}.json")
        
        if os.path.exists(json_path):
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            # Update players using name match
            updated_players = []
            for p_new in players:
                # Find matching player in existing data to preserve ratings if needed
                p_entry = next((item for item in data["players"] if item["name"] == p_new["name"]), None)
                if p_entry:
                    p_entry["shot_prop"] = p_new["shot_prop"]
                    p_entry["assist_prop"] = p_new["assist_prop"]
                    p_entry["stop_prop"] = p_new["stop_prop"]
                    updated_players.append(p_entry)
                else:
                    # Fallback if name mismatch (shouldn't happen with clean data)
                    updated_players.append(p_new)
            
            data["players"] = updated_players
            
            with open(json_path, 'w') as f:
                json.dump(data, f, indent=2)
            count += 1
        else:
            print(f"File not found: {json_path}")
            
    print(f"Successfully injected stats for {count} teams.")

if __name__ == "__main__":
    inject()
