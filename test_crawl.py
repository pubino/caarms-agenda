import unittest
from crawl import AgendaListParser, EventDetailParser

class TestCrawlParsers(unittest.TestCase):
    def test_agenda_list_parser(self):
        html = """
        <ul class="events-list-conference-day-tabs">
            <li><a href="#day-1" data-date="2026-06-29">Monday</a></li>
        </ul>
        <div id="day-1" class="events-list-conference-items-outer">
            <div class="events-list-conference-item">
                <div class="field field--name-field-ps-events-date"><span class="time">9:00 am</span> – <span class="time">10:00 am</span></div>
                <span class="field--name-title"><a href="/events/2026/jelani-nelson">Jelani Nelson</a></span>
                <div class="field field--name-field-ps-events-subtitle field--type-string field--label-hidden field__item">A Matrix Factorization Approach in Turnstile Streaming</div>
                <div class="field field--name-field-ps-events-location-name field--type-string field--label-inline clearfix">
                    <div class="field__item">Louis A. Simpson International Building</div>
                </div>
            </div>
        </div>
        """
        parser = AgendaListParser()
        parser.feed(html)
        
        self.assertEqual(len(parser.days), 1)
        self.assertEqual(parser.days[0]["id"], "day-1")
        self.assertEqual(parser.days[0]["date"], "2026-06-29")
        
        events = parser.events_by_day.get("day-1", [])
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event["title"], "Jelani Nelson")
        self.assertEqual(event["subtitle"], "A Matrix Factorization Approach in Turnstile Streaming")
        self.assertEqual(event["location"], "Louis A. Simpson International Building")
        self.assertEqual(event["time"], "9:00 am - 10:00 am")

    def test_event_detail_parser(self):
        html = """
        <h1 class="page-title">Jelani Nelson</h1>
        <div class="event-subtitle">A Matrix Factorization Approach in Turnstile Streaming</div>
        <article class="node--type-ps-events">
            <div class="field--name-field-ps-event-speaker-affillong">University of California at Berkeley</div>
            <div class="field--name-field-ps-body">This is the abstract.</div>
            <div class="field--name-field-ps-featured-image">
                <img src="/sites/g/files/nelson.jpg" alt="Jelani Nelson" />
            </div>
        </article>
        """
        parser = EventDetailParser()
        parser.feed(html)
        
        self.assertEqual(parser.h1_text, "Jelani Nelson")
        self.assertEqual("".join(parser.subtitle_text).strip(), "A Matrix Factorization Approach in Turnstile Streaming")
        self.assertEqual("".join(parser.affiliation_text).strip(), "University of California at Berkeley")
        self.assertEqual("".join(parser.body_text).strip(), "This is the abstract.")
        self.assertEqual(parser.image_src, "/sites/g/files/nelson.jpg")

if __name__ == "__main__":
    unittest.main()
