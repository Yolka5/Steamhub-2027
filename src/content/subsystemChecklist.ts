// The Handbook's subsystem approval checklist (section "צ’ק ליסט לאישור מכלול"), on every subsystem page too.
// Kept here as well so the subsystem page doesn't load the whole Handbook. Ticks are saved by
// position, so if the Handbook's list changes, change it here in the same order.

export const SUBSYSTEM_CHECKLIST: string[] = [
  "כל חלק שאמור לעלות על המכלול שלי נמצא בשרטוט (<b>כולל הכל</b>)",
  "שמתי משקלים לכל המכלול",
  "מספרתי את כל החלקים בBOM",
  "שמתי ברגים בכל המקומות",
  "כל הגאומטריות שלי תואמות את ה2D שלי, ושל האינטגרציה",
  "כל הרצועות\\שרשראות שלי ממקומות בצורה נכונה, עם המתיחה המתאימה למכניזם",
  "כל הגלגשים שלי ממקומים בצורה נכונה, בלי overlap/undrlap",
  "החורים שעשיתי למוצרי מדף תואמים את החורים במוצרי המדף",
  "בדקתי שיש לנו את החומרים שהשתמשתי בהם (פלטות, פרופילים, ספייסרים, צירים, ברגים) <b>חשוב לוודא שיש מספיק לכל המכלולים גם יחד, שלא כל אחד יחשוב שיש מספיק ואז כשעושים את הכל יחד מגלים שלא)</b>"
]
