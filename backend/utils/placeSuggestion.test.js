const { placeWords, placeKey, buildPlaceIndex, buildLearnedPlaces, closestPlace, suggestPlace } = require('./placeSuggestion');

const index = (...places) => buildPlaceIndex(places.map(p => (typeof p === 'string' ? { place: p, count: 1 } : p)));

describe('placeSuggestion', () => {
  test('placeWords drops store numbers, kind and province suffixes and punctuation', () => {
    expect(placeWords('SOBEYS #4123')).toEqual(['sobeys']);
    expect(placeWords('Loblaws #1114 - Purchase')).toEqual(['loblaws']);
    expect(placeWords('SHELL C21777 KANATA, ON')).toEqual(['shell', 'kanata']);
    expect(placeWords("McDonald's")).toEqual(['mcdonalds']);
    expect(placeWords('Telus Mobility - Pre-authorized debit')).toEqual(['telus', 'mobility']);
    expect(placeWords('Mom & Dad - INTERAC e-Transfer®')).toEqual(['mom', 'and', 'dad']);
  });

  test('a leading number stays part of the name', () => {
    expect(placeWords('7-Eleven #123')).toEqual(['7', 'eleven']);
    expect(placeWords('1202499 ONTARIO LT OTTAWA, ON')).toEqual(['1202499', 'ontario', 'lt', 'ottawa']);
  });

  test('closestPlace: an existing place the description starts with', () => {
    const places = index('Sobeys', 'Shell', 'Petro Canada', 'WalMart', 'Ontario');
    expect(closestPlace('SOBEYS #4123', places)).toBe('Sobeys');
    expect(closestPlace('SHELL C21777 KANATA, ON', places)).toBe('Shell');
    expect(closestPlace('PETRO-CANADA 35212 STITTSVILLE, ON', places)).toBe('Petro Canada');
    expect(closestPlace('Wal Mart', places)).toBe('WalMart');
    expect(closestPlace('1202499 ONTARIO LT OTTAWA, ON', places)).toBeNull();
  });

  test('closestPlace: only at a word boundary', () => {
    expect(closestPlace('SHELLFISH SHACK', index('Shell'))).toBeNull();
    expect(closestPlace('SOBEYS', index('Sobeys Liquor'))).toBeNull();
  });

  test('closestPlace: the longest match wins, then the most used, then the most recent', () => {
    expect(closestPlace('COSTCO GAS #123', index('Costco', 'Costco Gas'))).toBe('Costco Gas');
    expect(closestPlace('SOBEYS #1', index({ place: 'sobeys', count: 2 }, { place: 'Sobeys', count: 40 }))).toBe('Sobeys');
    expect(closestPlace('SOBEYS #1', index(
      { place: 'sobeys', count: 2, lastUsed: '2026-01-01' }, { place: 'SOBEYS', count: 2, lastUsed: '2026-10-01' }
    ))).toBe('SOBEYS');
  });

  test('closestPlace ignores places too short to be meaningful', () => {
    expect(closestPlace('AB STORE', index('AB'))).toBeNull();
  });

  test('buildLearnedPlaces: the most used place per description, the newest on a tie', () => {
    const learned = buildLearnedPlaces([
      { name: 'Yig Browns 405 - Purchase', merchantName: 'YIG', place: "Brown's Ind. Grocer" },
      { name: 'Yig Browns 405 - Purchase', merchantName: 'YIG', place: "Brown's Independent" },
      { name: 'YIG BROWNS 405 STITTSVILLE, ON', merchantName: 'Yig Browns', place: "Brown's Independent" },
      { name: 'Saunders Farm Munster, ON', merchantName: 'Saunders Farm', place: 'Saundersfarm.com' },
      { name: 'Saunders Farm Inc - Purchase', merchantName: 'Saunders Farm Inc', place: 'Saunders Farm' }
    ]);
    expect(learned.get(placeKey('Yig Browns 405 - Purchase'))).toBe("Brown's Independent");
    expect(learned.get(placeKey('Yig Browns'))).toBe("Brown's Independent");
    expect(learned.get(placeKey('Saunders Farm'))).toBe('Saundersfarm.com');
  });

  test('suggestPlace: what was chosen before, then the closest existing place, else nothing', () => {
    const learned = buildLearnedPlaces([{ name: 'Yig Browns 405 - Purchase', merchantName: 'YIG', place: "Brown's Independent" }]);
    const places = index("Brown's Independent", 'Sobeys', 'Yig');
    expect(suggestPlace([null, 'YIG BROWNS 406 - Purchase'], learned, places)).toBe("Brown's Independent");
    expect(suggestPlace(['Sobeys', 'Sobeys #4016 - Purchase'], learned, places)).toBe('Sobeys');
    expect(suggestPlace([null, 'SOBEYS #4123'], learned, places)).toBe('Sobeys');
    expect(suggestPlace(['Corner Store'], learned, places)).toBeNull();
  });
});
