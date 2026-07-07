import os
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Raw data from user
raw_data = """
Stratton United	Prime	Wolfgang Koch	Stratton United1	MID
Stratton United	Prime	Antoine Gauthier	Stratton United3	FWD
Stratton United	Prime	Gustavo Techera	Stratton United4	FWD
Stratton United	Prime	Christian Janssen	Stratton United2	DEF
Stratton United	Prime	Edgar Jimenez	Stratton United5	MID
Stratton United	Prime	Dayot Hernandez	Stratton United7	MID
Stratton United	Prime	Gonzalo Machado	Stratton United6	DEF
Stratton United	Prime	Trevor Shaw	Stratton United8	DEF
Stratton United	Prime	Saïd Djaloud	Stratton United9	GK
Haverford Black	Prime	Dragan Petrovic	Haverford Black1	FWD
Haverford Black	Prime	Andrew Moore	Haverford Black4	FWD
Haverford Black	Prime	Jurgen Richter	Haverford Black3	MID
Haverford Black	Prime	Jaime Riquelme	Haverford Black2	DEF
Haverford Black	Prime	Jose Lopes	Haverford Black5	GK
Haverford Black	Prime	Theo Tchouameni	Haverford Black6	DEF
Haverford Black	Prime	Ko Kamada	Haverford Black7	MID
Haverford Black	Prime	Charles Stewart	Haverford Black9	MID
Haverford Black	Prime	Murray Campbell	Haverford Black8	DEF
Stella Grey	Prime	Kwon Seung-Hyeok	Stella Grey1	FWD
Stella Grey	Prime	Park Hyeon-Bin	Stella Grey2	FWD
Stella Grey	Prime	Stephen Hunt	Stella Grey3	GK
Stella Grey	Prime	Wilhelm Schafer	Stella Grey4	DEF
Stella Grey	Prime	Clive Jones	Stella Grey5	DEF
Stella Grey	Prime	Gilberto Delgado	Stella Grey6	MID
Stella Grey	Prime	Salisu Abdul Samed	Stella Grey7	MID
Stella Grey	Prime	Gideon Seidu	Stella Grey8	DEF
Stella Grey	Prime	Juan Apaza	Stella Grey9	MID
Chateau Roux	Prime	Gustavo Suarez	Chateau Roux1	FWD
Chateau Roux	Prime	Diego Castillo	Chateau Roux4	FWD
Chateau Roux	Prime	Lisandro Romero	Chateau Roux2	MID
Chateau Roux	Prime	Pierre Blanchard	Chateau Roux3	GK
Chateau Roux	Prime	Bailey Myers-Morgan	Chateau Roux5	MID
Chateau Roux	Prime	Casey Myers-Morgan	Chateau Roux6	MID
Chateau Roux	Prime	Jeroen de Jong	Chateau Roux7	DEF
Chateau Roux	Prime	Marcel Verhoeven	Chateau Roux8	DEF
Chateau Roux	Prime	Claude Timmermans	Chateau Roux9	DEF
Glass Castle FC	Prime	Richard van der Heijden	Glass Castle FC1	FWD
Glass Castle FC	Prime	Marco Alvarez	Glass Castle FC2	FWD
Glass Castle FC	Prime	Ekanit Yooyen	Glass Castle FC3	GK
Glass Castle FC	Prime	Marc Watkins	Glass Castle FC4	MID
Glass Castle FC	Prime	Zeljko Vukevic	Glass Castle FC5	MID
Glass Castle FC	Prime	Manfred Fischer	Glass Castle FC6	DEF
Glass Castle FC	Prime	Nigel Price	Glass Castle FC7	DEF
Glass Castle FC	Prime	Hans Weber	Glass Castle FC8	DEF
Glass Castle FC	Prime	Francisco Rodrigues	Glass Castle FC9	MID
Thurston FC East	Prime	Bernard Michel	Thurston FC East1	MID
Thurston FC East	Prime	Nigel Maharaj	Thurston FC East2	MID
Thurston FC East	Prime	Adrian Llewellyn	Thurston FC East3	MID
Thurston FC East	Prime	Vitor Correia	Thurston FC East4	DEF
Thurston FC East	Prime	Hernan Torres	Thurston FC East6	FWD
Thurston FC East	Prime	Mbaye Cisse	Thurston FC East5	DEF
Thurston FC East	Prime	Theo de Boer	Thurston FC East7	FWD
Thurston FC East	Prime	Brahima Kamagate	Thurston FC East8	GK
Thurston FC East	Prime	Terence Kane	Thurston FC East9	DEF
Thurston FC West	Prime	Vincent van de Velde	Thurston FC West2	MID
Thurston FC West	Prime	Antonio Rudiger	Thurston FC West1	DEF
Thurston FC West	Prime	Ramon Perdomo	Thurston FC West3	MID
Thurston FC West	Prime	Thierry Payet	Thurston FC West4	MID
Thurston FC West	Prime	Conor O'Sullivan	Thurston FC West5	FWD
Thurston FC West	Prime	Patrick Murray	Thurston FC West7	FWD
Thurston FC West	Prime	Vicente Salazar	Thurston FC West6	GK
Thurston FC West	Prime	Martijn van den Berg	Thurston FC West8	DEF
Thurston FC West	Prime	Benoit Rousseau	Thurston FC West9	DEF
Eisenwald 1900	Prime	Sergio Baez	Eisenwald 19001	MID
Eisenwald 1900	Prime	Valeriu Florea	Eisenwald 19005	FWD
Eisenwald 1900	Prime	Stuart Holmes	Eisenwald 19004	MID
Eisenwald 1900	Prime	Carlos Acosta	Eisenwald 19006	FWD
Eisenwald 1900	Prime	Radu Dragomir	Eisenwald 19002	GK
Eisenwald 1900	Prime	Rene Chevalier	Eisenwald 19003	DEF
Eisenwald 1900	Prime	Fabian Gomez	Eisenwald 19007	MID
Eisenwald 1900	Prime	Gavin Powell	Eisenwald 19008	DEF
Eisenwald 1900	Prime	Karl Meier	Eisenwald 19009	DEF
Askhatansa	Prime	Jean-Pierre de Clercq	Askhatansa1	FWD
Askhatansa	Prime	Neil Griffith	Askhatansa2	FWD
Askhatansa	Prime	Vicente Acuna	Askhatansa3	GK
Askhatansa	Prime	Peter Meijer	Askhatansa4	MID
Askhatansa	Prime	Desmond Bonnet	Askhatansa5	MID
Askhatansa	Prime	Roy Foster	Askhatansa6	MID
Askhatansa	Prime	Vu Hung Dung	Askhatansa7	DEF
Askhatansa	Prime	Hiroshi Itakura	Askhatansa8	DEF
Askhatansa	Prime	Young-gwon Hwang	Askhatansa9	DEF
Cheicester City	Prime	Olivier Rousseau	Cheicester City1	FWD
Cheicester City	Prime	Dominique Girard	Cheicester City4	FWD
Cheicester City	Prime	Jean Gauthier	Cheicester City2	DEF
Cheicester City	Prime	Marcel Kuiper	Cheicester City3	GK
Cheicester City	Prime	Jeremie Frimpong	Cheicester City5	MID
Cheicester City	Prime	Elias Matsimbe	Cheicester City6	MID
Cheicester City	Prime	Clive Moore	Cheicester City7	DEF
Cheicester City	Prime	Declan Burke	Cheicester City8	DEF
Cheicester City	Prime	Floyd Adebayor	Cheicester City9	MID
Barroclaugh Athletic	Prime	Jiri Novakova	Barroclaugh Athletic1	GK
Barroclaugh Athletic	Prime	Manuel Castillo	Barroclaugh Athletic4	FWD
Barroclaugh Athletic	Prime	Marcos Aguilar	Barroclaugh Athletic5	FWD
Barroclaugh Athletic	Prime	Amadou Onana	Barroclaugh Athletic3	MID
Barroclaugh Athletic	Prime	Krzysztof Sikora	Barroclaugh Athletic2	DEF
Barroclaugh Athletic	Prime	Denis Chevalier	Barroclaugh Athletic7	MID
Barroclaugh Athletic	Prime	Timothy Theate	Barroclaugh Athletic6	DEF
Barroclaugh Athletic	Prime	Manaraii Wagemann	Barroclaugh Athletic8	DEF
Barroclaugh Athletic	Prime	Jamie Price	Barroclaugh Athletic9	MID
Havenpoort FC	Prime	Jacques Lemaire	Havenpoort FC1	MID
Havenpoort FC	Prime	Ruben Schar	Havenpoort FC2	MID
Havenpoort FC	Prime	Kalidou Koulibaly	Havenpoort FC3	MID
Havenpoort FC	Prime	Alain Goossens	Havenpoort FC5	FWD
Havenpoort FC	Prime	Mickael Caron	Havenpoort FC6	FWD
Havenpoort FC	Prime	Mario Morales	Havenpoort FC4	GK
Havenpoort FC	Prime	Esteban Maidana	Havenpoort FC7	DEF
Havenpoort FC	Prime	Denis Kizito	Havenpoort FC8	DEF
Havenpoort FC	Prime	Andritany Dimas	Havenpoort FC9	DEF
Les Brasseurs	Prime	Craig Young	Les Brasseurs2	FWD
Les Brasseurs	Prime	Sven Sjoberg	Les Brasseurs1	GK
Les Brasseurs	Prime	Edmond Toska	Les Brasseurs6	FWD
Les Brasseurs	Prime	Mitchell Duke	Les Brasseurs3	MID
Les Brasseurs	Prime	Yannick Barbier	Les Brasseurs4	MID
Les Brasseurs	Prime	Edwin Ruiz	Les Brasseurs5	MID
Les Brasseurs	Prime	Hernando Orozco	Les Brasseurs7	DEF
Les Brasseurs	Prime	Ramon Medina	Les Brasseurs8	DEF
Les Brasseurs	Prime	Marcos Paz	Les Brasseurs9	DEF
Corsaires de Calais	Prime	Gerhard Muller	Corsaires de Calais1	FWD
Corsaires de Calais	Prime	Jan van Dijk	Corsaires de Calais2	FWD
Corsaires de Calais	Prime	Eddy van den Broeck	Corsaires de Calais3	GK
Corsaires de Calais	Prime	Ramos Marrero	Corsaires de Calais6	MID
Corsaires de Calais	Prime	Richard Lemaire	Corsaires de Calais4	DEF
Corsaires de Calais	Prime	Ollie Rice	Corsaires de Calais5	DEF
Corsaires de Calais	Prime	Adrian Walsh	Corsaires de Calais7	DEF
Corsaires de Calais	Prime	Johan Post	Corsaires de Calais8	MID
Corsaires de Calais	Prime	Luis Gallese	Corsaires de Calais9	MID
Stedham Journeymen	Prime	Joao Pereira	Stedham Journeymen1	FWD
Stedham Journeymen	Prime	Eamon Murphy	Stedham Journeymen2	MID
Stedham Journeymen	Prime	Stefan Winter	Stedham Journeymen3	MID
Stedham Journeymen	Prime	Mohamed Alaoui	Stedham Journeymen5	FWD
Stedham Journeymen	Prime	Wilmer Paz	Stedham Journeymen4	GK
Stedham Journeymen	Prime	Pieter van Vliet	Stedham Journeymen7	MID
Stedham Journeymen	Prime	Craig Henderson	Stedham Journeymen6	DEF
Stedham Journeymen	Prime	Moses Okeke	Stedham Journeymen8	DEF
Stedham Journeymen	Prime	Harry Souttar	Stedham Journeymen9	DEF
Celtic Cross FC	Prime	Colin Pugh	Celtic Cross FC1	FWD
Celtic Cross FC	Prime	Marc Renard	Celtic Cross FC3	MID
Celtic Cross FC	Prime	Kenneth Wright	Celtic Cross FC2	GK
Celtic Cross FC	Prime	Leslie Knight	Celtic Cross FC4	FWD
Celtic Cross FC	Prime	Darren King	Celtic Cross FC5	DEF
Celtic Cross FC	Prime	Federico Barella	Celtic Cross FC6	MID
Celtic Cross FC	Prime	Rob Brouwer	Celtic Cross FC7	MID
Celtic Cross FC	Prime	Geert Verhoeven	Celtic Cross FC8	DEF
Celtic Cross FC	Prime	Philip Gibson	Celtic Cross FC9	DEF
Imperiale Roma	Med	Rodrigo de Jesus	Imperiale Roma1	DEF
Imperiale Roma	Med	Ricardo de Los Santos	Imperiale Roma2	GK
Imperiale Roma	Med	Felipe Contreras	Imperiale Roma3	FWD
Imperiale Roma	Med	Yuryi Melnyk	Imperiale Roma6	FWD
Imperiale Roma	Med	Kim Si-Yeon	Imperiale Roma4	MID
Imperiale Roma	Med	Cristian Molina	Imperiale Roma5	DEF
Imperiale Roma	Med	Shojae Cheshmi	Imperiale Roma7	DEF
Imperiale Roma	Med	John Bugeja	Imperiale Roma8	MID
Imperiale Roma	Med	Evangelos Mylonas	Imperiale Roma9	MID
Castellano Madrid	Med	Carlos Pereira	Castellano Madrid1	MID
Castellano Madrid	Med	Pavel Vesela	Castellano Madrid2	DEF
Castellano Madrid	Med	Fatmir Dervishi	Castellano Madrid4	FWD
Castellano Madrid	Med	Ahmed Mansouri	Castellano Madrid3	GK
Castellano Madrid	Med	Francois Toussaint	Castellano Madrid6	FWD
Castellano Madrid	Med	Henrik Mikkelsen	Castellano Madrid5	DEF
Castellano Madrid	Med	Luan Murati	Castellano Madrid7	DEF
Castellano Madrid	Med	Pere Munoz	Castellano Madrid8	MID
Castellano Madrid	Med	Felix Jradi	Castellano Madrid9	MID
Al-Qahira FC	Med	Alvaro Chaves	Al-Qahira FC1	FWD
Al-Qahira FC	Med	Ricardo Goncalves	Al-Qahira FC2	FWD
Al-Qahira FC	Med	Josef Steiner	Al-Qahira FC4	MID
Al-Qahira FC	Med	Andres Rodriguez	Al-Qahira FC3	DEF
Al-Qahira FC	Med	Neil Wright	Al-Qahira FC5	GK
Al-Qahira FC	Med	Jose Quispe	Al-Qahira FC6	DEF
Al-Qahira FC	Med	Sherif Farouk	Al-Qahira FC7	DEF
Al-Qahira FC	Med	Dejan Popovic	Al-Qahira FC8	MID
Al-Qahira FC	Med	Abdel Aziz Abid	Al-Qahira FC9	MID
Fursan al-Arab	Med	Joao Silva	Fursan al-Arab1	FWD
Fursan al-Arab	Med	Rafael Delgado	Fursan al-Arab2	DEF
Fursan al-Arab	Med	Cesar Aguero	Fursan al-Arab4	FWD
Fursan al-Arab	Med	Sergio Gutierrez	Fursan al-Arab3	GK
Fursan al-Arab	Med	Jose Romero	Fursan al-Arab5	DEF
Fursan al-Arab	Med	Eduardo Vaca	Fursan al-Arab6	DEF
Fursan al-Arab	Med	Amir Zare	Fursan al-Arab7	MID
Fursan al-Arab	Med	Abdalla Eisa	Fursan al-Arab8	MID
Fursan al-Arab	Med	Rachid Tahiri	Fursan al-Arab9	MID
Catalonia Gothic	Med	Mario Sosa	Catalonia Gothic1	MID
Catalonia Gothic	Med	Albert Hall	Catalonia Gothic2	FWD
Catalonia Gothic	Med	Arthur Kakuta	Catalonia Gothic3	MID
Catalonia Gothic	Med	Kyriacos Panayiotou	Catalonia Gothic5	FWD
Catalonia Gothic	Med	Roberto Sosa	Catalonia Gothic4	MID
Catalonia Gothic	Med	Michele di Stefano	Catalonia Gothic6	DEF
Catalonia Gothic	Med	Ljubomir Jovanovic	Catalonia Gothic7	GK
Catalonia Gothic	Med	Zuhair Hassan	Catalonia Gothic8	DEF
Catalonia Gothic	Med	Karim Mohamed	Catalonia Gothic9	DEF
Le Rocher Monaco	Med	Didier Diomande	Le Rocher Monaco1	FWD
Le Rocher Monaco	Med	Leandro Cordeiro	Le Rocher Monaco2	FWD
Le Rocher Monaco	Med	Alvaro Vazquez	Le Rocher Monaco4	MID
Le Rocher Monaco	Med	Salvatore Moretti	Le Rocher Monaco5	MID
Le Rocher Monaco	Med	Enrique Ortega	Le Rocher Monaco3	GK
Le Rocher Monaco	Med	Alejandro Garcia	Le Rocher Monaco6	MID
Le Rocher Monaco	Med	Mohamed Benyahia	Le Rocher Monaco7	DEF
Le Rocher Monaco	Med	Ilir Hoxha	Le Rocher Monaco8	DEF
Le Rocher Monaco	Med	Bassel Haidar	Le Rocher Monaco9	DEF
Barbary Apes	Med	Klaus Bauer	Barbary Apes1	GK
Barbary Apes	Med	Mustapha Hakimi	Barbary Apes2	MID
Barbary Apes	Med	Svein Berg	Barbary Apes4	FWD
Barbary Apes	Med	Tahnoon Ramadan	Barbary Apes6	FWD
Barbary Apes	Med	Ramazan Yilmaz	Barbary Apes3	DEF
Barbary Apes	Med	Jovan Trajkovic	Barbary Apes5	MID
Barbary Apes	Med	Med Mansour	Barbary Apes7	MID
Barbary Apes	Med	Abdel Allah	Barbary Apes8	DEF
Barbary Apes	Med	Amar Touati	Barbary Apes9	DEF
Olympias Athena	Med	Luis Aguirre	Olympias Athena1	GK
Olympias Athena	Med	Thomas Martin	Olympias Athena2	FWD
Olympias Athena	Med	Slobodan Kovacevic	Olympias Athena3	FWD
Olympias Athena	Med	Aissa Bounedjah	Olympias Athena4	MID
Olympias Athena	Med	Huseyin Sahin	Olympias Athena5	MID
Olympias Athena	Med	Alidu Mensah	Olympias Athena7	MID
Olympias Athena	Med	Arthur Coelho	Olympias Athena6	DEF
Olympias Athena	Med	Ali Al-Ahbabi	Olympias Athena8	DEF
Olympias Athena	Med	Savvas Constantinou	Olympias Athena9	DEF
Bosphorus Blue	Med	Giovanni Rossi	Bosphorus Blue2	FWD
Bosphorus Blue	Med	Roberjt Grgic	Bosphorus Blue1	MID
Bosphorus Blue	Med	Petr Navratil	Bosphorus Blue3	MID
Bosphorus Blue	Med	Hilal Maatouk	Bosphorus Blue5	FWD
Bosphorus Blue	Med	Gabriel Magalhaes	Bosphorus Blue4	MID
Bosphorus Blue	Med	Rabih El Zein	Bosphorus Blue6	GK
Bosphorus Blue	Med	Salaah Al-Yahyaei	Bosphorus Blue7	DEF
Bosphorus Blue	Med	Faisal Almarri	Bosphorus Blue8	DEF
Bosphorus Blue	Med	Ebrahim Al-Aswad	Bosphorus Blue9	DEF
Visconti Serpents	Med	Sergio Alves	Visconti Serpents1	MID
Visconti Serpents	Med	Manoel Ribiero	Visconti Serpents2	FWD
Visconti Serpents	Med	Mehdi Khalil	Visconti Serpents3	FWD
Visconti Serpents	Med	Reza Jafari	Visconti Serpents4	GK
Visconti Serpents	Med	Marcelo Majer	Visconti Serpents5	DEF
Visconti Serpents	Med	Shahid Khan	Visconti Serpents8	MID
Visconti Serpents	Med	Georges Béaruné	Visconti Serpents9	MID
Visconti Serpents	Med	Ammar Sabbag	Visconti Serpents6	DEF
Visconti Serpents	Med	Joe Waine	Visconti Serpents7	DEF
Lisbon United	Med	Giovanni Ricci	Lisbon United3	FWD
Lisbon United	Med	Marcelo da Silva	Lisbon United1	MID
Lisbon United	Med	Sergio Martino	Lisbon United5	FWD
Lisbon United	Med	Francesco Caruso	Lisbon United2	DEF
Lisbon United	Med	Gerardo Perez	Lisbon United4	MID
Lisbon United	Med	Pedro Huaman	Lisbon United6	GK
Lisbon United	Med	Stjepan Novosel	Lisbon United7	DEF
Lisbon United	Med	Dimitrios Papadopoulos	Lisbon United8	DEF
Lisbon United	Med	German Salazar	Lisbon United9	MID
Lions of Carthage	Med	Niko Lovric	Lions of Carthage1	FWD
Lions of Carthage	Med	Ivica Vidovic	Lions of Carthage2	FWD
Lions of Carthage	Med	Amr Shehab	Lions of Carthage3	GK
Lions of Carthage	Med	Giuseppe Giordano	Lions of Carthage4	DEF
Lions of Carthage	Med	Shabaib Al-Dhefiri	Lions of Carthage5	DEF
Lions of Carthage	Med	Moulaye Guidileye	Lions of Carthage7	MID
Lions of Carthage	Med	Ahmed Salah	Lions of Carthage6	DEF
Lions of Carthage	Med	Arshad Yadav	Lions of Carthage8	MID
Lions of Carthage	Med	Komail Al-Aswad	Lions of Carthage9	MID
Najm al-Bayda	Med	Dario Blanco	Najm al-Bayda1	FWD
Najm al-Bayda	Med	Vicente Garcia	Najm al-Bayda2	FWD
Najm al-Bayda	Med	Mario Appindangoyé	Najm al-Bayda3	GK
Najm al-Bayda	Med	Teboho Tau	Najm al-Bayda5	MID
Najm al-Bayda	Med	Walid Harit	Najm al-Bayda6	MID
Najm al-Bayda	Med	Jefferson Uribe	Najm al-Bayda4	DEF
Najm al-Bayda	Med	Mehmet Celik	Najm al-Bayda7	DEF
Najm al-Bayda	Med	Hassan Ataya	Najm al-Bayda9	MID
Najm al-Bayda	Med	Victor-Manuel Aguilar	Najm al-Bayda8	DEF
Alexandria Faros	Med	Patricio Torres	Alexandria Faros1	MID
Alexandria Faros	Med	Ali Mousavi	Alexandria Faros3	FWD
Alexandria Faros	Med	Alvaro Viera	Alexandria Faros2	MID
Alexandria Faros	Med	Freddy Lopez	Alexandria Faros5	FWD
Alexandria Faros	Med	German Arias	Alexandria Faros4	GK
Alexandria Faros	Med	Amine Ounahi	Alexandria Faros6	DEF
Alexandria Faros	Med	Gian Selva	Alexandria Faros7	DEF
Alexandria Faros	Med	Zlatko Novak	Alexandria Faros8	DEF
Alexandria Faros	Med	Agustin Lara	Alexandria Faros9	MID
Damascus Steel	Med	Ahmed Saleh	Damascus Steel1	GK
Damascus Steel	Med	Yusuf Guler	Damascus Steel2	FWD
Damascus Steel	Med	Salah Saidi	Damascus Steel3	FWD
Damascus Steel	Med	Fabrice Blanchard	Damascus Steel4	DEF
Damascus Steel	Med	Nestor Moreira	Damascus Steel5	DEF
Damascus Steel	Med	Andres Molina	Damascus Steel6	DEF
Damascus Steel	Med	Malcolm Hopkins	Damascus Steel7	MID
Damascus Steel	Med	Didier Bouanga	Damascus Steel8	MID
Damascus Steel	Med	Ramesh Shrestha	Damascus Steel9	MID
Tripoli Sporting	Med	Juan Rivera	Tripoli Sporting1	FWD
Tripoli Sporting	Med	Fahad Ali	Tripoli Sporting3	FWD
Tripoli Sporting	Med	Andrej Kos	Tripoli Sporting2	GK
Tripoli Sporting	Med	Said Taleb	Tripoli Sporting4	MID
Tripoli Sporting	Med	Stavros Giannopoulos	Tripoli Sporting5	MID
Tripoli Sporting	Med	Abo Samir	Tripoli Sporting6	MID
Tripoli Sporting	Med	Milan Mitrovic	Tripoli Sporting7	DEF
Tripoli Sporting	Med	Amer Zaid	Tripoli Sporting8	DEF
Tripoli Sporting	Med	Giampiero Suriani	Tripoli Sporting9	DEF
Moscow Krepost	Euro	Soren Holm	Moscow Krepost1	MID
Moscow Krepost	Euro	Zoran Ilic	Moscow Krepost2	MID
Moscow Krepost	Euro	Kristjan Jonsson	Moscow Krepost3	MID
Moscow Krepost	Euro	Ilija Hodzic	Moscow Krepost4	DEF
Moscow Krepost	Euro	Niels Jensen	Moscow Krepost5	FWD
Moscow Krepost	Euro	Arnaldo Benitez	Moscow Krepost6	FWD
Moscow Krepost	Euro	Zoran Atanasov	Moscow Krepost7	GK
Moscow Krepost	Euro	Laszlo Kovacs	Moscow Krepost8	DEF
Moscow Krepost	Euro	Lars Jonsson	Moscow Krepost9	DEF
Slavutych Kyiv	Euro	Pawel Lewandowski	Slavutych Kyiv1	FWD
Slavutych Kyiv	Euro	Maksim Volkova	Slavutych Kyiv2	FWD
Slavutych Kyiv	Euro	Tomislav Rakic	Slavutych Kyiv3	GK
Slavutych Kyiv	Euro	Zoltan Kocsis	Slavutych Kyiv5	MID
Slavutych Kyiv	Euro	Nykolai Moroz	Slavutych Kyiv4	DEF
Slavutych Kyiv	Euro	Franz Ospelt	Slavutych Kyiv7	MID
Slavutych Kyiv	Euro	Jesper Thomsen	Slavutych Kyiv6	DEF
Slavutych Kyiv	Euro	Heikki Laine	Slavutych Kyiv8	DEF
Slavutych Kyiv	Euro	Algimantas Zilinskas	Slavutych Kyiv9	MID
Edelweiss Zurich	Euro	Simon Knight	Edelweiss Zurich1	FWD
Edelweiss Zurich	Euro	Marcos Ospina	Edelweiss Zurich3	FWD
Edelweiss Zurich	Euro	Miroslav Pavlovic	Edelweiss Zurich2	GK
Edelweiss Zurich	Euro	Pavel Ivanova	Edelweiss Zurich4	DEF
Edelweiss Zurich	Euro	Aka Dah	Edelweiss Zurich6	MID
Edelweiss Zurich	Euro	Erik Olsen	Edelweiss Zurich5	DEF
Edelweiss Zurich	Euro	Anders Lindstrom	Edelweiss Zurich8	MID
Edelweiss Zurich	Euro	Fredrik Johansson	Edelweiss Zurich9	MID
Edelweiss Zurich	Euro	Slobodan Krstic	Edelweiss Zurich7	DEF
Stockholm United	Euro	Florin Stan	Stockholm United1	FWD
Stockholm United	Euro	Jan Prochazka	Stockholm United3	FWD
Stockholm United	Euro	Vyktor Kovalenko	Stockholm United4	MID
Stockholm United	Euro	Rolf Schulze	Stockholm United2	GK
Stockholm United	Euro	Andrzej Nowak	Stockholm United6	MID
Stockholm United	Euro	Lucas Luiz	Stockholm United5	DEF
Stockholm United	Euro	Darius Balciunas	Stockholm United7	DEF
Stockholm United	Euro	Viktor Morozov	Stockholm United8	DEF
Stockholm United	Euro	Jovan Stojanovski	Stockholm United9	MID
Oslo Vikinger	Euro	Andreas Wyss	Oslo Vikinger1	FWD
Oslo Vikinger	Euro	Orlando Cardona	Oslo Vikinger2	FWD
Oslo Vikinger	Euro	Serhei Tkachenko	Oslo Vikinger3	GK
Oslo Vikinger	Euro	Park Jun-Seo	Oslo Vikinger4	DEF
Oslo Vikinger	Euro	Odilon Gradel	Oslo Vikinger5	DEF
Oslo Vikinger	Euro	Petar Stojanovic	Oslo Vikinger6	DEF
Oslo Vikinger	Euro	Aleksandr Kuznetsov	Oslo Vikinger7	MID
Oslo Vikinger	Euro	Gheorghe Cristea	Oslo Vikinger8	MID
Oslo Vikinger	Euro	Constantin Prodan	Oslo Vikinger9	MID
Donau Wien	Euro	Stefan Takac	Donau Wien1	FWD
Donau Wien	Euro	Franc Potocnik	Donau Wien3	FWD
Donau Wien	Euro	Jan Johansen	Donau Wien2	MID
Donau Wien	Euro	Rafael Parra	Donau Wien4	MID
Donau Wien	Euro	Cieran McCormick	Donau Wien5	GK
Donau Wien	Euro	Werner Frei	Donau Wien6	MID
Donau Wien	Euro	Vasile Cazacu	Donau Wien7	DEF
Donau Wien	Euro	Arni Olafsson	Donau Wien8	DEF
Donau Wien	Euro	Pedro Dos Santos	Donau Wien9	DEF
Dunav Belgrade	Euro	Kjell Nilsen	Dunav Belgrade1	FWD
Dunav Belgrade	Euro	Vitaliy Zabarnyi	Dunav Belgrade2	MID
Dunav Belgrade	Euro	Vasylyi Yvanova	Dunav Belgrade3	MID
Dunav Belgrade	Euro	Raul Morales	Dunav Belgrade6	FWD
Dunav Belgrade	Euro	Ari Korhonen	Dunav Belgrade4	MID
Dunav Belgrade	Euro	Piotr Nowicki	Dunav Belgrade5	GK
Dunav Belgrade	Euro	Gerhard Bauer	Dunav Belgrade7	DEF
Dunav Belgrade	Euro	Ernest Nuamah	Dunav Belgrade8	DEF
Dunav Belgrade	Euro	Marko Bosnjak	Dunav Belgrade9	DEF
Sisu Helsinki	Euro	Ivan Popova	Sisu Helsinki1	FWD
Sisu Helsinki	Euro	Mathieu Lefevre	Sisu Helsinki5	FWD
Sisu Helsinki	Euro	Aleksandr Olyinyk	Sisu Helsinki2	DEF
Sisu Helsinki	Euro	Bojan Kavcic	Sisu Helsinki3	DEF
Sisu Helsinki	Euro	Krasimi Georgiev	Sisu Helsinki4	GK
Sisu Helsinki	Euro	Andrey Zaitsev	Sisu Helsinki6	MID
Sisu Helsinki	Euro	Emilio Segundo	Sisu Helsinki7	DEF
Sisu Helsinki	Euro	Pascal Ferreira	Sisu Helsinki8	MID
Sisu Helsinki	Euro	Stefan Meier	Sisu Helsinki9	MID
Kongens FC	Euro	Jens Clausen	Kongens FC1	GK
Kongens FC	Euro	Arvydas Vasiliauskas	Kongens FC2	FWD
Kongens FC	Euro	Mauricio Rios	Kongens FC3	FWD
Kongens FC	Euro	Istvan Kiss	Kongens FC4	MID
Kongens FC	Euro	Jani Rasanen	Kongens FC5	MID
Kongens FC	Euro	Valentin Ionescu	Kongens FC6	MID
Kongens FC	Euro	Ladislav Kovac	Kongens FC7	DEF
Kongens FC	Euro	Daniel Wohlwend	Kongens FC8	DEF
Kongens FC	Euro	Fernando Ribiero	Kongens FC9	DEF
Bohemian Gryphons	Euro	Georgios Nikolaidis	Bohemian Gryphons1	FWD
Bohemian Gryphons	Euro	Sandor Toth	Bohemian Gryphons2	FWD
Bohemian Gryphons	Euro	Eero Salo	Bohemian Gryphons3	GK
Bohemian Gryphons	Euro	Thomas Anderson	Bohemian Gryphons5	MID
Bohemian Gryphons	Euro	Rolf Bachmann	Bohemian Gryphons4	DEF
Bohemian Gryphons	Euro	Stojan Petrovska	Bohemian Gryphons6	MID
Bohemian Gryphons	Euro	Kairat Kichin	Bohemian Gryphons7	DEF
Bohemian Gryphons	Euro	Valerijs Priede	Bohemian Gryphons9	MID
Bohemian Gryphons	Euro	Giorgio Chellini	Bohemian Gryphons8	DEF
Korona Warsaw	Euro	Janos Meszaros	Korona Warsaw1	GK
Korona Warsaw	Euro	Slobodan Radic	Korona Warsaw2	FWD
Korona Warsaw	Euro	Vaclav Dvorak	Korona Warsaw4	FWD
Korona Warsaw	Euro	Tomasz Zajac	Korona Warsaw3	DEF
Korona Warsaw	Euro	Karl Olsson	Korona Warsaw5	DEF
Korona Warsaw	Euro	Branko Novac	Korona Warsaw6	MID
Korona Warsaw	Euro	Bajram Sylejmani	Korona Warsaw7	MID
Korona Warsaw	Euro	Aleksandr Kallas	Korona Warsaw8	MID
Korona Warsaw	Euro	Marcel Roth	Korona Warsaw9	DEF
Magyar Huszar	Euro	Faïz Bachirou	Magyar Huszar2	FWD
Magyar Huszar	Euro	Stoyan Nikolov	Magyar Huszar3	FWD
Magyar Huszar	Euro	Robson Medeiros	Magyar Huszar1	GK
Magyar Huszar	Euro	Hector Alvarez	Magyar Huszar4	DEF
Magyar Huszar	Euro	Moussa Amani	Magyar Huszar5	MID
Magyar Huszar	Euro	Ammar Krouma	Magyar Huszar6	MID
Magyar Huszar	Euro	Jiang Linpeng	Magyar Huszar7	MID
Magyar Huszar	Euro	Edwin Torrez	Magyar Huszar8	DEF
Magyar Huszar	Euro	Veselin Ivanov	Magyar Huszar9	DEF
Bucharest International	Euro	Frantisek Molnar	Bucharest International1	FWD
Bucharest International	Euro	Karl Mayer	Bucharest International4	FWD
Bucharest International	Euro	Hadisi Aengari	Bucharest International2	GK
Bucharest International	Euro	Marcel Wagner	Bucharest International3	DEF
Bucharest International	Euro	Pansa Kaman	Bucharest International5	MID
Bucharest International	Euro	Jacek Majewski	Bucharest International8	MID
Bucharest International	Euro	Rafael Jimenez	Bucharest International6	DEF
Bucharest International	Euro	Lalaina Amada	Bucharest International9	MID
Bucharest International	Euro	Peeter Ots	Bucharest International7	DEF
Sarajevo Grad	Euro	Caio Sultan	Sarajevo Grad2	FWD
Sarajevo Grad	Euro	Antanas Zukauskas	Sarajevo Grad3	FWD
Sarajevo Grad	Euro	Markus Schneider	Sarajevo Grad1	GK
Sarajevo Grad	Euro	Azamat Zemlianukhin	Sarajevo Grad6	MID
Sarajevo Grad	Euro	Johann Gunnarsson	Sarajevo Grad4	DEF
Sarajevo Grad	Euro	Hamid Bagheri	Sarajevo Grad5	DEF
Sarajevo Grad	Euro	Paweł Bednarek	Sarajevo Grad7	DEF
Sarajevo Grad	Euro	Juraj Szabo	Sarajevo Grad8	MID
Sarajevo Grad	Euro	Georgios Christofi	Sarajevo Grad9	MID
Reykjavik Isbjorn	Euro	Akhtam Jalilov	Reykjavik Isbjorn1	FWD
Reykjavik Isbjorn	Euro	Gunnar Bjornsson	Reykjavik Isbjorn2	FWD
Reykjavik Isbjorn	Euro	Mo Diallo	Reykjavik Isbjorn3	GK
Reykjavik Isbjorn	Euro	Marjan Krajnc	Reykjavik Isbjorn5	MID
Reykjavik Isbjorn	Euro	Mitch Alick	Reykjavik Isbjorn4	DEF
Reykjavik Isbjorn	Euro	Joseph Wari	Reykjavik Isbjorn8	MID
Reykjavik Isbjorn	Euro	Nigel Clarke	Reykjavik Isbjorn9	MID
Reykjavik Isbjorn	Euro	Liviu Ciobanu	Reykjavik Isbjorn6	DEF
Reykjavik Isbjorn	Euro	Andreas Schwarz	Reykjavik Isbjorn7	DEF
Slavia Tatry	Euro	Martin Lang	Slavia Tatry1	GK
Slavia Tatry	Euro	Felix Gallego	Slavia Tatry2	FWD
Slavia Tatry	Euro	Janis Berzins	Slavia Tatry3	FWD
Slavia Tatry	Euro	Michal Fialova	Slavia Tatry5	MID
Slavia Tatry	Euro	Fouad Selemani	Slavia Tatry4	DEF
Slavia Tatry	Euro	Anton Zupan	Slavia Tatry6	DEF
Slavia Tatry	Euro	Carlo D'Amico	Slavia Tatry8	MID
Slavia Tatry	Euro	Tomas Arias	Slavia Tatry9	MID
Slavia Tatry	Euro	Alberto Diaz	Slavia Tatry7	DEF
New York Empire	Backyard	Nick Hamburger	New York Empire1	FWD
New York Empire	Backyard	Raul Ortiz	New York Empire2	MID
New York Empire	Backyard	Helmut Lange	New York Empire4	FWD
New York Empire	Backyard	Silas McBride	New York Empire3	DEF
New York Empire	Backyard	Helgi Magnusson	New York Empire5	MID
New York Empire	Backyard	Miguel Ortega	New York Empire6	DEF
New York Empire	Backyard	Tim Moore	New York Empire7	GK
New York Empire	Backyard	Lorenzo Marte	New York Empire8	DEF
New York Empire	Backyard	Orlando Centeno	New York Empire9	MID
Los Angeles Syndicate	Backyard	Nicolae Popescu	Los Angeles Syndicate1	FWD
Los Angeles Syndicate	Backyard	Nicolas Montero	Los Angeles Syndicate4	FWD
Los Angeles Syndicate	Backyard	Pedro Flores	Los Angeles Syndicate3	MID
Los Angeles Syndicate	Backyard	Milan Marjanovic	Los Angeles Syndicate5	MID
Los Angeles Syndicate	Backyard	Dmitriy Shevchenko	Los Angeles Syndicate2	GK
Los Angeles Syndicate	Backyard	Sawyer Marshall	Los Angeles Syndicate6	MID
Los Angeles Syndicate	Backyard	Nicholas Persad	Los Angeles Syndicate7	DEF
Los Angeles Syndicate	Backyard	Frantz Germaine	Los Angeles Syndicate8	DEF
Los Angeles Syndicate	Backyard	Brandon Boyd	Los Angeles Syndicate9	DEF
Las Vegas Mirage	Backyard	Mohammed Odoi	Las Vegas Mirage1	FWD
Las Vegas Mirage	Backyard	Nam Min-Jae	Las Vegas Mirage2	GK
Las Vegas Mirage	Backyard	William Davies	Las Vegas Mirage3	MID
Las Vegas Mirage	Backyard	Anthony Gonzales	Las Vegas Mirage5	FWD
Las Vegas Mirage	Backyard	Knox Fletcher	Las Vegas Mirage4	MID
Las Vegas Mirage	Backyard	Antonio Chavez	Las Vegas Mirage6	DEF
Las Vegas Mirage	Backyard	Fernando Reyes	Las Vegas Mirage7	MID
Las Vegas Mirage	Backyard	Johan Vasquez	Las Vegas Mirage8	DEF
Las Vegas Mirage	Backyard	Junya Ito	Las Vegas Mirage9	DEF
Chicago Surge	Backyard	Adriano Campos	Chicago Surge2	FWD
Chicago Surge	Backyard	Juan Narvaez	Chicago Surge1	DEF
Chicago Surge	Backyard	Joseph Clarke	Chicago Surge4	FWD
Chicago Surge	Backyard	Jozsef Szabo	Chicago Surge3	DEF
Chicago Surge	Backyard	Pedro Reis	Chicago Surge5	GK
Chicago Surge	Backyard	Terezinha Rocha	Chicago Surge6	DEF
Chicago Surge	Backyard	James Delva	Chicago Surge7	MID
Chicago Surge	Backyard	Peter Ramirez	Chicago Surge8	MID
Chicago Surge	Backyard	Domingo Ordonez	Chicago Surge9	MID
Boston Rebellion	Backyard	Francisco Castillo	Boston Rebellion1	MID
Boston Rebellion	Backyard	Javier Guerra	Boston Rebellion2	GK
Boston Rebellion	Backyard	Sergio Almeida	Boston Rebellion3	MID
Boston Rebellion	Backyard	Edward Gauthier	Boston Rebellion4	MID
Boston Rebellion	Backyard	Sharaf El Hadi	Boston Rebellion5	FWD
Boston Rebellion	Backyard	Ben Ben Nabouhane	Boston Rebellion6	FWD
Boston Rebellion	Backyard	Jean-Philippe Saïko	Boston Rebellion7	DEF
Boston Rebellion	Backyard	Ernesto Cordoba	Boston Rebellion8	DEF
Boston Rebellion	Backyard	Brooks Hollister	Boston Rebellion9	DEF
Toronto Blizzard	Backyard	Adrian Johnson	Toronto Blizzard2	MID
Toronto Blizzard	Backyard	Brandon Vargas	Toronto Blizzard3	MID
Toronto Blizzard	Backyard	Tadashi Sato	Toronto Blizzard1	GK
Toronto Blizzard	Backyard	Jorge Quesada	Toronto Blizzard5	MID
Toronto Blizzard	Backyard	Jeyland Mitchell	Toronto Blizzard4	DEF
Toronto Blizzard	Backyard	Juan-Carlos Novelo	Toronto Blizzard6	FWD
Toronto Blizzard	Backyard	Mustafa Simsek	Toronto Blizzard7	FWD
Toronto Blizzard	Backyard	Jacques Lavoie	Toronto Blizzard8	DEF
Toronto Blizzard	Backyard	Ramon Bonilla	Toronto Blizzard9	DEF
Mexico City Sol	Backyard	Cesar Paredes	Mexico City Sol1	FWD
Mexico City Sol	Backyard	Peter Buhler	Mexico City Sol2	FWD
Mexico City Sol	Backyard	Dexter Edwards	Mexico City Sol3	GK
Mexico City Sol	Backyard	Evidence Tau	Mexico City Sol5	MID
Mexico City Sol	Backyard	Zizo Fathi	Mexico City Sol4	DEF
Mexico City Sol	Backyard	Rowllin Singh	Mexico City Sol6	DEF
Mexico City Sol	Backyard	Marc Tremblay	Mexico City Sol7	MID
Mexico City Sol	Backyard	Jean Roberts	Mexico City Sol9	MID
Mexico City Sol	Backyard	Muaid Musrati	Mexico City Sol8	DEF
Seattle Echo	Backyard	Pedro Banegas	Seattle Echo1	FWD
Seattle Echo	Backyard	Serghei Cojocari	Seattle Echo3	FWD
Seattle Echo	Backyard	Alcides Cabrera	Seattle Echo2	GK
Seattle Echo	Backyard	Jaxson Wilder	Seattle Echo4	MID
Seattle Echo	Backyard	Juan Araya	Seattle Echo5	DEF
Seattle Echo	Backyard	Enrique de Leon	Seattle Echo6	DEF
Seattle Echo	Backyard	Enrique Blanco	Seattle Echo7	MID
Seattle Echo	Backyard	Tomasi Devi	Seattle Echo9	MID
Seattle Echo	Backyard	Gustavo Vega	Seattle Echo8	DEF
Philadelphia Spirit	Backyard	Angel Cedeno	Philadelphia Spirit2	FWD
Philadelphia Spirit	Backyard	Victor Weaver	Philadelphia Spirit1	GK
Philadelphia Spirit	Backyard	Walker Hayes	Philadelphia Spirit3	FWD
Philadelphia Spirit	Backyard	Manuel Gonçalves	Philadelphia Spirit5	MID
Philadelphia Spirit	Backyard	Marlon Padilla	Philadelphia Spirit4	DEF
Philadelphia Spirit	Backyard	Musa Musa	Philadelphia Spirit7	MID
Philadelphia Spirit	Backyard	Jorge Molina	Philadelphia Spirit8	MID
Philadelphia Spirit	Backyard	Felix Rodriguez	Philadelphia Spirit6	DEF
Philadelphia Spirit	Backyard	Pedro Nsue	Philadelphia Spirit9	DEF
Dallas Flare	Backyard	Hector	Dallas Flare1	FWD
Dallas Flare	Backyard	Diego Perez	Dallas Flare2	FWD
Dallas Flare	Backyard	César Nyikeine	Dallas Flare3	GK
Dallas Flare	Backyard	Felipe Juarez	Dallas Flare4	DEF
Dallas Flare	Backyard	Gabriel Juarez	Dallas Flare5	MID
Dallas Flare	Backyard	Manuel Amador	Dallas Flare6	MID
Dallas Flare	Backyard	Antoine Semenyo	Dallas Flare9	MID
Dallas Flare	Backyard	Hugo Rosas	Dallas Flare7	DEF
Dallas Flare	Backyard	Tomas Morales	Dallas Flare8	DEF
San Jose Relampago	Backyard	Jordan Amartey	San Jose Relampago1	FWD
San Jose Relampago	Backyard	Domingo Roldan	San Jose Relampago2	FWD
San Jose Relampago	Backyard	Inaki Kudus	San Jose Relampago3	GK
San Jose Relampago	Backyard	Rafael Borré	San Jose Relampago4	MID
San Jose Relampago	Backyard	Reinildo Dove	San Jose Relampago5	DEF
San Jose Relampago	Backyard	Jorge Sanchez	San Jose Relampago6	MID
San Jose Relampago	Backyard	Edwin Lopez	San Jose Relampago8	MID
San Jose Relampago	Backyard	Francis Baptiste	San Jose Relampago7	DEF
San Jose Relampago	Backyard	Hamza El Mehdi	San Jose Relampago9	DEF
Montreal Coureurs	Backyard	Matti Jokinen	Montreal Coureurs1	FWD
Montreal Coureurs	Backyard	Santiago Barrios	Montreal Coureurs3	FWD
Montreal Coureurs	Backyard	Cassius Reed	Montreal Coureurs2	GK
Montreal Coureurs	Backyard	Rafael Tejeda	Montreal Coureurs4	MID
Montreal Coureurs	Backyard	Vicente Mendez	Montreal Coureurs5	MID
Montreal Coureurs	Backyard	Wayne Harrison	Montreal Coureurs6	MID
Montreal Coureurs	Backyard	Arthur Kayembe	Montreal Coureurs7	DEF
Montreal Coureurs	Backyard	Armando Dominguez	Montreal Coureurs8	DEF
Montreal Coureurs	Backyard	Youssouf M'Changama	Montreal Coureurs9	DEF
Tijuana Vaqueros	Backyard	Guadalupe Moreno	Tijuana Vaqueros1	FWD
Tijuana Vaqueros	Backyard	Scott Robinson	Tijuana Vaqueros3	FWD
Tijuana Vaqueros	Backyard	Ahmet Ozcan	Tijuana Vaqueros2	GK
Tijuana Vaqueros	Backyard	Rogelio Valencia	Tijuana Vaqueros4	MID
Tijuana Vaqueros	Backyard	Phil Schröck	Tijuana Vaqueros5	MID
Tijuana Vaqueros	Backyard	Liu Lei	Tijuana Vaqueros6	DEF
Tijuana Vaqueros	Backyard	Kassaly Hainikoye	Tijuana Vaqueros9	MID
Tijuana Vaqueros	Backyard	Jaime Chavarria	Tijuana Vaqueros7	DEF
Tijuana Vaqueros	Backyard	Carlos Vieira	Tijuana Vaqueros8	DEF
Washington Justice	Backyard	Marc Sanon	Washington Justice1	GK
Washington Justice	Backyard	Vojislav Milic	Washington Justice2	FWD
Washington Justice	Backyard	Spyridon Karagiannis	Washington Justice3	FWD
Washington Justice	Backyard	Guillaume Deschamps	Washington Justice4	DEF
Washington Justice	Backyard	Siyanda Zwane	Washington Justice5	DEF
Washington Justice	Backyard	Johan Charlier	Washington Justice7	MID
Washington Justice	Backyard	Martin Patiño	Washington Justice6	DEF
Washington Justice	Backyard	Yukio Ono	Washington Justice8	MID
Washington Justice	Backyard	Jonathan Carmichael	Washington Justice9	MID
Detroit Firebirds	Backyard	Joel Hosein	Detroit Firebirds1	FWD
Detroit Firebirds	Backyard	Neville Grant	Detroit Firebirds2	FWD
Detroit Firebirds	Backyard	Mauricio Fuentes	Detroit Firebirds3	GK
Detroit Firebirds	Backyard	Felipe Pinheiro	Detroit Firebirds6	MID
Detroit Firebirds	Backyard	Felix Cardozo	Detroit Firebirds4	DEF
Detroit Firebirds	Backyard	Cesar Romero	Detroit Firebirds5	DEF
Detroit Firebirds	Backyard	Nico Soria	Detroit Firebirds7	MID
Detroit Firebirds	Backyard	Clyde Gittens	Detroit Firebirds8	MID
Detroit Firebirds	Backyard	Graham Chapman	Detroit Firebirds9	DEF
Denver Torrent	Backyard	Edgar Rojas	Denver Torrent1	GK
Denver Torrent	Backyard	Geraldo Faife	Denver Torrent2	FWD
Denver Torrent	Backyard	Hassan Mohammadi	Denver Torrent4	FWD
Denver Torrent	Backyard	Javier Giraldo	Denver Torrent3	DEF
Denver Torrent	Backyard	Abdoul Oumarou	Denver Torrent5	DEF
Denver Torrent	Backyard	Kim Min-Jun	Denver Torrent7	MID
Denver Torrent	Backyard	Diego Correia	Denver Torrent6	DEF
Denver Torrent	Backyard	Ricardo Mejia	Denver Torrent8	MID
Denver Torrent	Backyard	Hugh McAuley	Denver Torrent9	MID
"""

def inject():
    lines = raw_data.strip().splitlines()
    count = 0
    
    for line in lines:
        parts = line.split('\t')
        if len(parts) < 5: continue
        team, league, name, _, pos = parts
        
        # Folder mapping
        league_folder = "Backyard" if league == "Backyard" else league
        json_path = os.path.join(BASE_DIR, "Tournaments", "2025", league_folder, "Teams", f"{team}.json")
        
        if os.path.exists(json_path):
            with open(json_path, 'r') as f:
                data = json.load(f)
            
            player_found = False
            for p in data.get("players", []):
                if p["name"] == name:
                    p["pos"] = pos
                    player_found = True
                    break
            
            if player_found:
                with open(json_path, 'w') as f:
                    json.dump(data, f, indent=2)
                count += 1
            
    print(f"Successfully injected positions for {count} players.")

if __name__ == "__main__":
    inject()
