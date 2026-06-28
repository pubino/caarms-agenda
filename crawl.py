import os
import re
import ssl
import json
import urllib.request
import urllib.parse
from html.parser import HTMLParser

# 1. HTML Parsers using stdlib HTMLParser

class AgendaListParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.days = []
        self.current_day_id = None
        self.events_by_day = {}
        
        self.in_tabs = False
        self.current_tab_a = None
        
        self.div_stack = []
        self.span_stack = []
        
        self.current_event = None
        self.capture_time = False
        self.current_time_texts = []
        
        self.capture_title = False
        self.current_title_link = None
        self.current_title_text = []
        
        self.capture_location = False
        self.current_location_text = []
        
        self.capture_subtitle = False
        self.current_subtitle_text = []
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        
        # Day Tabs list
        if tag == "ul" and attrs_dict.get("class") == "events-list-conference-day-tabs":
            self.in_tabs = True
            
        if self.in_tabs and tag == "a":
            self.current_tab_a = {
                "id": attrs_dict.get("href", "").lstrip("#"),
                "date": attrs_dict.get("data-date", ""),
                "name": ""
            }
            
        # Outer container of day items
        if tag == "div" and "events-list-conference-items-outer" in attrs_dict.get("class", ""):
            self.current_day_id = attrs_dict.get("id")
            self.events_by_day[self.current_day_id] = []
            
        # Individual event item
        if tag == "div" and attrs_dict.get("class") == "events-list-conference-item":
            self.current_event = {
                "time": "",
                "title": "",
                "location": "",
                "link": "",
                "subtitle": ""
            }
            
        # Push to tag stacks to track nesting
        if tag == "div":
            self.div_stack.append(attrs_dict)
            if self.current_event:
                if "field--name-field-ps-events-subtitle" in attrs_dict.get("class", ""):
                    self.capture_subtitle = True
                    self.current_subtitle_text = []
                elif len(self.div_stack) >= 2:
                    parent = self.div_stack[-2]
                    if "field--name-field-ps-events-location-name" in parent.get("class", "") and attrs_dict.get("class") == "field__item":
                        self.capture_location = True
                        self.current_location_text = []
                    
        if tag == "span":
            self.span_stack.append(attrs_dict)
            if "field--name-field-ps-events-date" in attrs_dict.get("class", "") or "field--name-field-ps-events-date" in [d.get("class", "") for d in self.div_stack]:
                if attrs_dict.get("class") == "time":
                    self.capture_time = True
            
            if "field--name-title" in attrs_dict.get("class", ""):
                self.capture_title = True
                self.current_title_text = []
                
        if self.capture_title and tag == "a":
            self.current_title_link = attrs_dict.get("href")

    def handle_endtag(self, tag):
        if tag == "ul" and self.in_tabs:
            self.in_tabs = False
            
        if self.in_tabs and tag == "a" and self.current_tab_a:
            self.days.append(self.current_tab_a)
            self.current_tab_a = None
            
        if tag == "div":
            if self.div_stack:
                popped = self.div_stack.pop()
                if self.capture_location and popped.get("class") == "field__item":
                    self.capture_location = False
                    if self.current_event:
                        self.current_event["location"] = "".join(self.current_location_text).strip()
                if self.capture_subtitle and "field--name-field-ps-events-subtitle" in popped.get("class", ""):
                    self.capture_subtitle = False
                    if self.current_event:
                        self.current_event["subtitle"] = "".join(self.current_subtitle_text).strip()
            
            if self.current_event and not any(d.get("class") == "events-list-conference-item" for d in self.div_stack):
                time_str = " ".join(self.current_time_texts).replace(" – ", " - ").strip()
                time_str = re.sub(r'\s+', ' ', time_str)
                self.current_event["time"] = time_str
                self.current_time_texts = []
                
                if self.current_day_id in self.events_by_day:
                    self.events_by_day[self.current_day_id].append(self.current_event)
                self.current_event = None
                
        if tag == "span":
            if self.span_stack:
                popped = self.span_stack.pop()
                if self.capture_title and "field--name-title" in popped.get("class", ""):
                    self.capture_title = False
                    if self.current_event:
                        self.current_event["title"] = "".join(self.current_title_text).strip()
                        if self.current_title_link:
                            self.current_event["link"] = self.current_title_link
                    self.current_title_link = None
                    self.current_title_text = []
                elif self.capture_time and popped.get("class") == "time":
                    self.capture_time = False

    def handle_data(self, data):
        if self.in_tabs and self.current_tab_a:
            self.current_tab_a["name"] += data
            
        if self.current_event:
            in_date_div = False
            for d in self.div_stack:
                if "field--name-field-ps-events-date" in d.get("class", ""):
                    in_date_div = True
                    break
            if in_date_div:
                self.current_time_texts.append(data)
                
            if self.capture_title:
                self.current_title_text.append(data)
                
            if self.capture_location:
                self.current_location_text.append(data)

            if self.capture_subtitle:
                self.current_subtitle_text.append(data)


class EventDetailParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.div_stack = []
        self.h1_text = None
        self.in_h1 = False
        
        self.article_depth = 0
        self.footer_depth = 0
        
        self.image_src = None
        self.image_alt = None
        
        self.affiliation_text = []
        self.in_affiliation = False
        
        self.body_text = []
        self.in_body = False
        
        self.subtitle_text = []
        self.in_subtitle = False
        
    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        
        if tag == "article":
            self.article_depth += 1
        if tag == "footer":
            self.footer_depth += 1
            
        if tag == "div":
            self.div_stack.append(attrs_dict)
            if "field--name-field-ps-event-speaker-affillong" in attrs_dict.get("class", ""):
                self.in_affiliation = True
            if "field--name-field-ps-body" in attrs_dict.get("class", "") and self.article_depth > 0 and self.footer_depth == 0:
                self.in_body = True
            if attrs_dict.get("class") == "event-subtitle":
                self.in_subtitle = True
                self.subtitle_text = []
                
        if tag == "img":
            is_featured = False
            for d in self.div_stack:
                if "field--name-field-ps-featured-image" in d.get("class", ""):
                    is_featured = True
                    break
            if is_featured:
                self.image_src = attrs_dict.get("src")
                self.image_alt = attrs_dict.get("alt")
                
        if tag == "h1":
            if "page-title" in attrs_dict.get("class", "") or not attrs_dict.get("class"):
                self.in_h1 = True
                self.h1_text = []

    def handle_endtag(self, tag):
        if tag == "article":
            self.article_depth = max(0, self.article_depth - 1)
        if tag == "footer":
            self.footer_depth = max(0, self.footer_depth - 1)
            
        if tag == "div" and self.div_stack:
            popped = self.div_stack.pop()
            if "field--name-field-ps-event-speaker-affillong" in popped.get("class", ""):
                self.in_affiliation = False
            if "field--name-field-ps-body" in popped.get("class", ""):
                self.in_body = False
            if popped.get("class") == "event-subtitle":
                self.in_subtitle = False
                
        if tag == "h1" and self.in_h1:
            self.in_h1 = False
            self.h1_text = "".join(self.h1_text).strip()

    def handle_data(self, data):
        if self.in_h1:
            self.h1_text.append(data)
        if self.in_affiliation:
            self.affiliation_text.append(data)
        if self.in_body:
            self.body_text.append(data)
        if self.in_subtitle:
            self.subtitle_text.append(data)

# 2. Main Crawler Execution Code

def load_env():
    env = {}
    if os.path.exists(".env"):
        with open(".env", "r") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip()
    return env

def get_headers(env):
    # Retrieve Cloudflare bypass config from environment or .env
    bypass_header = os.environ.get("BYPASS_HEADER_NAME") or env.get("BYPASS_HEADER_NAME")
    bypass_value = os.environ.get("BYPASS_HEADER_VALUE") or env.get("BYPASS_HEADER_VALUE")
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    if bypass_header and bypass_value:
        headers[bypass_header] = bypass_value
        print(f"Using Cloudflare bot bypass header: {bypass_header}")
    else:
        print("Warning: Cloudflare bypass headers not set. Scraper may be blocked by bot detection.")
        print("To resolve, set BYPASS_HEADER_NAME and BYPASS_HEADER_VALUE in environment or .env file.")
    return headers

def fetch_url(url, headers):
    req = urllib.request.Request(url, headers=headers)
    context = ssl.create_default_context()
    # Disable SSL verification issues if they occur
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    
    with urllib.request.urlopen(req, context=context, timeout=20) as response:
        return response.read()

def main():
    env = load_env()
    headers = get_headers(env)
    
    base_url = "https://caarms.princeton.edu"
    agenda_url = f"{base_url}/agenda"
    
    print(f"Crawling agenda index: {agenda_url}")
    try:
        agenda_html = fetch_url(agenda_url, headers).decode("utf-8")
    except Exception as e:
        print(f"Fatal error fetching agenda: {e}")
        return
        
    list_parser = AgendaListParser()
    list_parser.feed(agenda_html)
    
    # Restructure day by day
    agenda_data = {}
    
    # Ensure speaker images folder exists
    os.makedirs("images/speakers", exist_ok=True)
    
    # Map raw days
    for day in list_parser.days:
        day_id = day["id"]
        date_str = day["date"]
        day_name = day["name"].strip()
        
        events = list_parser.events_by_day.get(day_id, [])
        
        # Deduplicate events
        unique_events = []
        seen = set()
        for ev in events:
            key = (ev["time"], ev["title"], ev["location"])
            if key not in seen:
                seen.add(key)
                unique_events.append(ev)
                
        print(f"\nProcessing {day_name} ({date_str}) - {len(unique_events)} events...")
        
        detailed_events = []
        for ev in unique_events:
            title = ev["title"]
            time_str = ev["time"]
            loc_str = ev["location"]
            link = ev["link"]
            
            detail_data = {
                "time": time_str,
                "title": title,
                "location": loc_str,
                "link": link,
                "subtitle": ev.get("subtitle", ""),
                "speaker": "",
                "affiliation": "",
                "abstract": "",
                "image": ""
            }
            
            # If there's an event detail link, crawl it for speakers and abstracts
            if link:
                detail_url = link if link.startswith("http") else f"{base_url}{link}"
                print(f"  Fetching details for: '{title}' ({detail_url})...")
                try:
                    detail_html = fetch_url(detail_url, headers).decode("utf-8")
                    detail_parser = EventDetailParser()
                    detail_parser.feed(detail_html)
                    
                    # Extract values
                    detail_data["speaker"] = detail_parser.h1_text or ""
                    detail_data["affiliation"] = "".join(detail_parser.affiliation_text).strip()
                    detail_data["abstract"] = "".join(detail_parser.body_text).strip()
                    if detail_parser.subtitle_text:
                        detail_data["subtitle"] = "".join(detail_parser.subtitle_text).strip()
                    
                    # Download speaker image if available
                    img_src = detail_parser.image_src
                    if img_src:
                        # Standardize image url
                        img_url = img_src if img_src.startswith("http") else f"{base_url}{img_src}"
                        # Save local path
                        filename = os.path.basename(urllib.parse.urlparse(img_url).path)
                        # Avoid empty/invalid names
                        if not filename or "." not in filename:
                            filename = f"speaker_{len(detailed_events)}.jpg"
                        
                        local_img_path = f"images/speakers/{filename}"
                        print(f"    Downloading speaker image: {img_url} -> {local_img_path}")
                        try:
                            img_bytes = fetch_url(img_url, headers)
                            with open(local_img_path, "wb") as img_file:
                                img_file.write(img_bytes)
                            detail_data["image"] = local_img_path
                        except Exception as img_err:
                            print(f"    Error downloading image {img_url}: {img_err}")
                            # Fallback to online url
                            detail_data["image"] = img_url
                except Exception as e_detail:
                    print(f"  Error fetching detail page for '{title}': {e_detail}")
            
            # If the event represents a breaks or meals (no speaker details)
            if not detail_data["speaker"] and title not in ["Breakfast and Welcome Remarks", "Welcoming Reception", "Breakfast at 125 - Sherrerd Hall"]:
                # Sometimes the title is the speaker's name itself
                # Let's inspect if the speaker field is empty, set it to title if it matches common names
                pass
                
            detailed_events.append(detail_data)
            
        agenda_data[date_str] = {
            "day_name": day_name,
            "date": date_str,
            "events": detailed_events
        }

    # Save to file
    with open("agenda_data.json", "w", encoding="utf-8") as f:
        json.dump(agenda_data, f, indent=2)
        
    print(f"\nCrawl complete! Successfully saved {len(agenda_data)} days to agenda_data.json")

if __name__ == "__main__":
    main()
