# Культуры и пулы имён (эталон для S.11 «Карточка рождения»)

Эталон до кода (D-430). Тим отмечает `- [x]` имена, которые звучат; пустые считаются «нет». Потом S.11 переносит отмеченное в `content/cultures.yaml` и `content/names.yaml`. Связано с D-436, D-454. Имена — латиницей, без диакритики (см. «Риски»). Всего 5 культур × 60 = 300 записей.

## Что на карте
Из `map/region.json`: культуры Azgaar — Haverish (7, Хаверланд), Aurennese (2, Оренн), Borean (6) и Northern Borean (8) (Борея), Izmari (5, Измара), Levantine (9, община), Tallian (1, Ticumiegia), Elladan (3, Byblia), Vengrian (4, Duhadia). Больших держав четыре, малых три и все с разной культурой, общей заметной нет. Для среза: четыре большие плюс Tallian как запасная побережная для малых; Elladan и Vengrian — следующим шагом, если Тим захочет.

## Согласование с D-313
В срезе (S.11) берутся только пулы имён и генератор при рождении. Правила фамилий при браке и у детей, прозвища Izmari с наследованием и название рода по основателю — предложения на этап 5: D-313 откладывает правила фамилий по державам туда. Пока действует D-313: имена при браке не меняются, ребёнок героини-главы носит её фамилию, род зовётся по фамилии.

## Что нужно ядру из полей имени
- `given` — обязательное.
- `surname` — обязательное; у Izmari это прозвище, ядру достаточно культурного флага `surnameKind: family | byname`.
- `patronymic` — необязательное, только Borean.
- Женская форма фамилии: правило культуры (`surnameFemale: same | borean_rules`); нужна функция «фамилия по полу», реально только для Borean.
- Название рода — шаблон культуры (`houseTemplate`): `House of {surname}`; у Izmari предлагается `Household of {given}` (имя основателя). Сейчас род берёт имя по фамилии (`house/phases.ts`); смена — предложение на этап 5, ждёт Тима.
- Культура и держава — id в данных героя и семьи (`culture`, `state`).
- Выбор пула: `culture` → 20 `male`, 20 `female`, 20 `surnames`, правила частоты (вес 2 у частых).

## Haverish (`haverish`)
- **Держава:** Free Provinces of Haverland (Ostmere); база Azgaar German, культура Haverish (id 7).
- **Традиция:** голландско-фризская торговая традиция с примесью нижненемецкой (Нидерланды 1700).
- **Как звучит:** Короткие тяжёлые корни (Wil-, Hen-, Cor-), окончания -t, -k, -s, -n; женские -a, -je, -ke. Фамилии с частицами `van`, `de`, `ten` и торговые на -s (Koopmans). Города карты (Rohrbach, Waldbron, Oberkenhau) звучат скорее по-немецки; имена даём нидерландские: республика бюргеров и моря.
- **Полное имя:** Фамилия есть (бюргерские дома); у простых часто отчество-фамилия на -s/-sen. Женщина в хронике носит фамилию мужа после брака, до брака — отца. Дети — фамилия отца. *(Брак и дети — предложение на этап 5. До него действует D-313: имена при браке не меняются, ребёнок героини-главы носит её фамилию.)*
- **Поля:** `given` + `surname`. Род: «House of X» (купеческий дом).

### Правила генератора
- Частые (вес 2): Willem, Jan, Maria, Anna; остальные 1.
- Ребёнка с вероятностью ~35% называют по деду или бабке (первый сын — дед по отцу, второй — по матери).
- Частицы (`van`, `de`, `ten`) — часть `surname`, с маленькой буквы в середине строки.
- Женская форма фамилии не меняется.

### Мужские
- [ ] Willem
- [ ] Joost
- [ ] Pieter
- [ ] Hendrik
- [ ] Cornelis
- [ ] Jan
- [ ] Dirk
- [ ] Gerrit
- [ ] Maarten
- [ ] Adriaan
- [ ] Reinier
- [ ] Lambert
- [ ] Floris
- [ ] Thijs
- [ ] Frans
- [ ] Albert
- [ ] Matthijs
- [ ] Evert
- [ ] Jacob
- [ ] Johan

### Женские
- [ ] Maria
- [ ] Catharina
- [ ] Anna
- [ ] Geertruid
- [ ] Johanna
- [ ] Margriet
- [ ] Aleida
- [ ] Cornelia
- [ ] Elisabeth
- [ ] Hendrika
- [ ] Sara
- [ ] Judith
- [ ] Wilhelmina
- [ ] Neeltje
- [ ] Trijn
- [ ] Dorothea
- [ ] Magdalena
- [ ] Lijsbeth
- [ ] Marijke
- [ ] Josina

### Фамилии
- [ ] van der Meer
- [ ] Verhoeven
- [ ] de Groot
- [ ] Brouwer
- [ ] Visser
- [ ] Hoogstraten
- [ ] van Dam
- [ ] Oosterhout
- [ ] Bakker
- [ ] Kerkhoff
- [ ] Wolters
- [ ] Steenhuis
- [ ] ten Brink
- [ ] Haverkamp
- [ ] de Wit
- [ ] Mulder
- [ ] Vermeulen
- [ ] Rademaker
- [ ] Dijkstra
- [ ] Koopmans

## Aurennese (`aurennese`)
- **Держава:** Kingdom of Aurenne (Valmont); база Azgaar French, культура Aurennese (id 2).
- **Традиция:** французская, двор и провинция времён Людовика XIV.
- **Как звучит:** Мягкие окончания -ier, -eau, -ard, носовые Jean/Antoine; женские на -e, -ette, -ine. Фамилии: ремёсла (Marchand, Barbier), приметы (Lemaire), места (Delacour); у знати частица `de`. Города: Valmont, Fouche, Marmant, Sceauzon, Ailliers.
- **Полное имя:** Фамилия есть у всех. Женщина после брака в хронике получает фамилию мужа (единообразно с Haverish). Знатные носят `de`+место, простые — без частицы. *(Брак и дети — предложение на этап 5. До него действует D-313: имена при браке не меняются, ребёнок героини-главы носит её фамилию.)*
- **Поля:** `given` + `surname` (частица `de` внутри surname). Род: «House of X».

### Правила генератора
- Частые (вес 2): Jean, Pierre, Louis, Marie, Anne, Jeanne.
- Двойные имена (Jean-Baptiste, Marie-Anne) — одно `given`, не более 15% случаев.
- Имя крёстного или деда — ~40%; у знати старший сын часто носит имя отца.
- Фамилии с `de` — только у знатного достатка.

### Мужские
- [ ] Jean
- [ ] Pierre
- [ ] Louis
- [ ] Etienne
- [ ] Henri
- [ ] Antoine
- [ ] Claude
- [ ] Guillaume
- [ ] Gaspard
- [ ] Nicolas
- [ ] Mathieu
- [ ] Hugues
- [ ] Armand
- [ ] Charles
- [ ] Gilles
- [ ] Baptiste
- [ ] Thibault
- [ ] Olivier
- [ ] Raoul
- [ ] Lucien

### Женские
- [ ] Marie
- [ ] Anne
- [ ] Jeanne
- [ ] Madeleine
- [ ] Marguerite
- [ ] Louise
- [ ] Catherine
- [ ] Isabeau
- [ ] Charlotte
- [ ] Francoise
- [ ] Elisabeth
- [ ] Genevieve
- [ ] Suzanne
- [ ] Claudine
- [ ] Henriette
- [ ] Agnes
- [ ] Beatrice
- [ ] Philippine
- [ ] Renee
- [ ] Colette

### Фамилии
- [ ] Duval
- [ ] Lemaire
- [ ] Beaumont
- [ ] Fontaine
- [ ] Roussel
- [ ] de Marsac
- [ ] Delorme
- [ ] Chevalier
- [ ] Marchand
- [ ] Lefebvre
- [ ] Moreau
- [ ] Dubois
- [ ] de Saint-Aubin
- [ ] Gautier
- [ ] Perrin
- [ ] Lacroix
- [ ] Vasseur
- [ ] Montclair
- [ ] Barbier
- [ ] Delacour

## Borean (`borean`)
- **Держава:** Borean Empire (Novomor, Kostrograd); база Azgaar Ruthenian, культуры Borean и Northern Borean (id 6, 8).
- **Традиция:** русская, петровское время.
- **Как звучит:** Имена из святцев (Ivan, Fyodor, Praskovya), звонкие и короткие; фамилии на -ov/-ev/-in (родовые) и -sky (знатные, по уделам). Города: Pepozelsk, Derinsk, Kobuchev, Ovensk, Lubkov (суффиксы -sk, -ev, -ov). Северный Borean (Kostrograd) — те же пулы.
- **Полное имя:** Три части: имя, отчество, фамилия. Фамилии в 1700 есть у дворян и купцов, у крестьян чаще только отчество; в игре упрощаем: фамилию получают все. Женщина — женская форма фамилии и отчество на -ovna/-evna; дети — фамилия отца. *(Брак и дети — предложение на этап 5. До него действует D-313: имена при браке не меняются, ребёнок героини-главы носит её фамилию.)*
- **Поля:** `given` + `patronymic` + `surname`. Отчество строится от имени отца (-ovich/-evich, -ovna/-evna). Род: «House of Orlov» (мужская форма).

### Правила генератора
- Частые (вес 2): Ivan, Pyotr, Fyodor, Anna, Maria.
- Отчество от имени отца: Ivan → Ivanovich/Ivanovna, Pyotr → Petrovich/Petrovna, имена на -i/-y → -yevich, на -a → -ich (Nikita → Nikitich).
- Фамилия на -sky/-skaya — только у знатного достатка.
- Имя по святому дня рождения или деду — ~35%.
- Женская форма: -ov/-ev/-in → -ova/-eva/-ina; -sky → -skaya; -ykh не меняется.

### Мужские
- [ ] Ivan
- [ ] Pyotr
- [ ] Aleksei
- [ ] Fyodor
- [ ] Mikhail
- [ ] Dmitri
- [ ] Grigori
- [ ] Nikita
- [ ] Semyon
- [ ] Yakov
- [ ] Vasili
- [ ] Andrei
- [ ] Stepan
- [ ] Timofei
- [ ] Matvei
- [ ] Kirill
- [ ] Yegor
- [ ] Osip
- [ ] Afanasi
- [ ] Boris

### Женские
- [ ] Anna
- [ ] Maria
- [ ] Yekaterina
- [ ] Praskovya
- [ ] Avdotya
- [ ] Marfa
- [ ] Anastasia
- [ ] Yelena
- [ ] Darya
- [ ] Agrafena
- [ ] Natalya
- [ ] Ulyana
- [ ] Fyokla
- [ ] Yevdokia
- [ ] Irina
- [ ] Ksenia
- [ ] Tatyana
- [ ] Vera
- [ ] Aksinya
- [ ] Pelageya

### Фамилии
- [ ] Orlov
- [ ] Volkov
- [ ] Sokolov
- [ ] Morozov
- [ ] Belsky
- [ ] Zhukov
- [ ] Lykov
- [ ] Streshnev
- [ ] Rzhevsky
- [ ] Kozlov
- [ ] Tarusov
- [ ] Yaroslavtsev
- [ ] Vorontsev
- [ ] Chernyshov
- [ ] Dobrynin
- [ ] Solovyov
- [ ] Pushkarev
- [ ] Mstislavsky
- [ ] Kurbatov
- [ ] Tolstykh

## Izmari (`izmari`)
- **Держава:** Sultanate of Izmara (Sarayhan); база Azgaar Turkish, культура Izmari (id 5); община Levantine (id 9) — см. риски.
- **Традиция:** османская, столичная и провинциальная.
- **Как звучит:** Гармония гласных (Mehmed, Mustafa, Murad), окончания -an, -ed; женские -e, -a. Прозвища на -ci, -li, -oglu. Города: Opuzsenev, Alpraklu, Yatoprak, Baharduman, Okormale (суффиксы -ak, -lu, -an).
- **Полное имя:** Фамилий в 1700 нет. В игре `surname` — прозвище (`byname`), три типа: от отца (`Mehmedoglu`), ремесло или примета (Demirci «кузнец», Topal «хромой»), место (Sarayhanli). Женщина носит то же прозвище. Прозвище-ремесло ребёнок часто наследует, иначе получает своё. *(Брак и дети — предложение на этап 5. До него действует D-313: имена при браке не меняются, ребёнок героини-главы носит её фамилию.)*
- **Поля:** `given` + `surname` (по смыслу byname); `patronymic` не нужен. Род: предложение — «Household of {имя основателя}» (konak), не по прозвищу; до этапа 5 — по прозвищу, как у всех (D-313).

### Правила генератора
- Прозвище при рождении: 40% ремесло, 30% место, 20% примета (Kara, Topal, Sari), 10% `-oglu` от имени отца.
- Ребёнок наследует прозвище отца: ремесло и `-oglu` — 50%, иначе новое.
- Женской формы нет; `bint` не пишем.
- Частые (вес 2): Mehmed, Ahmed, Mustafa, Ayse, Fatma.
- Левантийская община: тот же пул плюс по желанию Тима 5–10 имён (Yusuf, Maryam и т. п.) и прозвища на -i; пока отдельный пул не нужен.

### Мужские
- [ ] Mehmed
- [ ] Ahmed
- [ ] Mustafa
- [ ] Ibrahim
- [ ] Hasan
- [ ] Huseyin
- [ ] Ali
- [ ] Yusuf
- [ ] Osman
- [ ] Murad
- [ ] Suleyman
- [ ] Ismail
- [ ] Halil
- [ ] Yakup
- [ ] Omer
- [ ] Bayram
- [ ] Kasim
- [ ] Davud
- [ ] Mahmud
- [ ] Recep

### Женские
- [ ] Ayse
- [ ] Fatma
- [ ] Hatice
- [ ] Zeynep
- [ ] Emine
- [ ] Hafize
- [ ] Meryem
- [ ] Safiye
- [ ] Saliha
- [ ] Nefise
- [ ] Rabia
- [ ] Gulsah
- [ ] Munire
- [ ] Kamile
- [ ] Zehra
- [ ] Nuriye
- [ ] Havva
- [ ] Esma
- [ ] Hurrem
- [ ] Sultane

### Прозвища (вместо фамилий)
- [ ] Demirci
- [ ] Topal
- [ ] Kara
- [ ] Sari
- [ ] Deli
- [ ] Terzi
- [ ] Bakkal
- [ ] Kayikci
- [ ] Tuzcu
- [ ] Ciftci
- [ ] Tellal
- [ ] Hamamci
- [ ] Bostanci
- [ ] Tatar
- [ ] Sarayhanli
- [ ] Bahardumanli
- [ ] Yatoprakli
- [ ] Okormaleli
- [ ] Kasap
- [ ] Mehmedoglu

## Tallian (`tallian`)
- **Держава:** Duchy of Ticumiegia (Cerranole, Acquaduno); база Azgaar Tallian (id 1) — запасная культура побережья для малых держав.
- **Традиция:** итальянская, морские города и герцогства.
- **Как звучит:** Открытые гласные, окончания -o, -a, -i, -ini, -elli. Фамилии множественные (Bellandi, Rinaldi). Города: Cerranole, Acquaduno, Cravenay. Elladan (Byblia) и Vengrian (Duhadia) отложены.
- **Полное имя:** Фамилия есть. Женщина в хронике — фамилия мужа после брака. Дети — фамилия отца. Двойных фамилий нет. *(Брак и дети — предложение на этап 5. До него действует D-313: имена при браке не меняются, ребёнок героини-главы носит её фамилию.)*
- **Поля:** `given` + `surname`. Род: «House of X».

### Правила генератора
- Частые (вес 2): Giovanni, Antonio, Francesco, Maria, Caterina.
- Первый сын — по деду по отцу, второй — по деду по матери, третий — по отцу; дочери аналогично.
- Уменьшительные (Gianni, Nino) не используем.

### Мужские
- [ ] Giovanni
- [ ] Antonio
- [ ] Francesco
- [ ] Giacomo
- [ ] Lorenzo
- [ ] Bartolomeo
- [ ] Paolo
- [ ] Pietro
- [ ] Matteo
- [ ] Giuseppe
- [ ] Domenico
- [ ] Tommaso
- [ ] Benedetto
- [ ] Niccolo
- [ ] Ludovico
- [ ] Carlo
- [ ] Gaspare
- [ ] Marco
- [ ] Alvise
- [ ] Ottavio

### Женские
- [ ] Maria
- [ ] Caterina
- [ ] Lucia
- [ ] Anna
- [ ] Giulia
- [ ] Elisabetta
- [ ] Margherita
- [ ] Francesca
- [ ] Teresa
- [ ] Chiara
- [ ] Bianca
- [ ] Isabella
- [ ] Laura
- [ ] Angela
- [ ] Giovanna
- [ ] Cecilia
- [ ] Livia
- [ ] Paola
- [ ] Vittoria
- [ ] Ginevra

### Фамилии
- [ ] Cerrano
- [ ] Acquaviva
- [ ] Bellandi
- [ ] Moretti
- [ ] Ferrante
- [ ] Contarelli
- [ ] Salvi
- [ ] Orsolini
- [ ] Lombardi
- [ ] Rinaldi
- [ ] Tarantino
- [ ] Valsecchi
- [ ] Bonfanti
- [ ] Caruso
- [ ] Marini
- [ ] Brandolini
- [ ] Sartori
- [ ] Pellegrini
- [ ] Vitale
- [ ] Ricci

## Риски
- **Путаница:** Anna, Maria, Catherine/Caterina/Catharina есть в нескольких культурах; Jan/Johan/Jean/Giovanni/Ivan — один корень. Различаем фамилией и формой (Anna Orlova против Anna Brouwer); в интерфейсе культуру показываем значком или цветом державы.
- **Haverish и Aurennese:** пары Hendrik/Henri, Willem/Guillaume, Maria/Marie родственны; на карточке три семьи лучше брать из разных культур, чтобы пары не оказались рядом.
- **Borean:** тройные имена (Pyotr Ivanovich Orlov) длинны для строки хроники; предлагаю в хронике `given surname`, полное имя с отчеством — на карточке и в родословной.
- **Izmari:** прозвище вместо фамилии даёт слабое чувство рода (Topal не родовое). Дому имя даётся по основателю (Household of Ali), а не по прозвищу.
- **Диакритика:** предлагаю без неё (Etienne, Huseyin, Francoise, Suleyman) ради шрифта, ввода и поиска; потеря — немного аутентичности. Если Тим захочет, добавим необязательное поле `display` с é, ü, ş, ğ, а `given` оставим безакцентным.
- **Частицы:** `van der`, `de`, `ten` лежат внутри `surname`; сортировка по последнему слову.
- **Запрещённые пары генератора:** Grigori, Aleksei или Fyodor + Orlov; Johan + de Wit; список дополнить при переносе в `content/` (сверка с известными людьми).
- **Реальные люди:** полных имён известных лиц среди сочетаний нет, но Orlov, Moreau и т. п. случайно совпадут с реальными; перед переносом проверить пары.
