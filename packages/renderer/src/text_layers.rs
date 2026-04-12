//! Text layer SVG generators — produce SVG strings for ConcertInfo,
//! NowPlaying, SetlistScroll, and SongArt overlays.
//!
//! These are called by the manifest generator (Node.js) or can be
//! used directly in Rust for testing. Each function produces a
//! complete SVG string ready for resvg rasterization.

use serde::Deserialize;

/// Concert metadata for the title card.
#[derive(Debug, Deserialize, Clone)]
pub struct ShowInfo {
    pub title: String,
    pub venue: String,
    pub date: String,
    pub era: String,
}

/// Song metadata for NowPlaying and setlist.
#[derive(Debug, Deserialize, Clone)]
pub struct SongInfo {
    pub title: String,
    pub set_number: u32,
    pub track_number: u32,
    pub is_current: bool,
}

/// Generate the concert info title card SVG.
/// Positioned at bottom-left with venue, date, and era badge.
pub fn concert_info_svg(info: &ShowInfo, width: u32, height: u32, opacity: f32) -> String {
    let op = format!("{:.2}", opacity.clamp(0.0, 1.0));
    let margin = (width as f32 * 0.04) as u32;
    let y_base = height - margin - 20;
    let title_size = (width as f32 * 0.022).max(18.0) as u32;
    let venue_size = (width as f32 * 0.014).max(12.0) as u32;
    let date_size = (width as f32 * 0.012).max(10.0) as u32;

    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\">\
         <g opacity=\"{}\">\
         <text x=\"{}\" y=\"{}\" font-family=\"'Helvetica Neue', Helvetica, Arial, sans-serif\" \
          font-size=\"{}\" font-weight=\"700\" fill=\"white\" \
          filter=\"drop-shadow(0 2px 4px rgba(0,0,0,0.8))\">{}</text>\
         <text x=\"{}\" y=\"{}\" font-family=\"'Helvetica Neue', Helvetica, Arial, sans-serif\" \
          font-size=\"{}\" font-weight=\"400\" fill=\"rgba(255,255,255,0.8)\" \
          filter=\"drop-shadow(0 1px 3px rgba(0,0,0,0.6))\">{}</text>\
         <text x=\"{}\" y=\"{}\" font-family=\"'Helvetica Neue', Helvetica, Arial, sans-serif\" \
          font-size=\"{}\" font-weight=\"300\" fill=\"rgba(255,255,255,0.6)\">{}</text>\
         </g></svg>",
        width, height, op,
        margin, y_base - venue_size - date_size - 8, title_size, xml_escape(&info.title),
        margin, y_base - date_size - 4, venue_size, xml_escape(&info.venue),
        margin, y_base, date_size, xml_escape(&info.date),
    )
}

/// Generate the NowPlaying song title SVG.
/// Positioned at bottom-center.
pub fn now_playing_svg(song: &str, width: u32, height: u32, opacity: f32) -> String {
    let op = format!("{:.2}", opacity.clamp(0.0, 1.0));
    let cx = width / 2;
    let y = height - (height as f32 * 0.06) as u32;
    let size = (width as f32 * 0.018).max(14.0) as u32;

    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\">\
         <g opacity=\"{}\">\
         <text x=\"{}\" y=\"{}\" font-family=\"'Helvetica Neue', Helvetica, Arial, sans-serif\" \
          font-size=\"{}\" font-weight=\"600\" fill=\"white\" text-anchor=\"middle\" \
          filter=\"drop-shadow(0 1px 3px rgba(0,0,0,0.7))\">{}</text>\
         </g></svg>",
        width, height, op,
        cx, y, size, xml_escape(song),
    )
}

/// Generate the setlist scroll SVG.
/// Vertical list of songs with the current song highlighted.
pub fn setlist_svg(
    songs: &[SongInfo],
    width: u32,
    height: u32,
    opacity: f32,
) -> String {
    let op = format!("{:.2}", opacity.clamp(0.0, 1.0));
    let margin = (width as f32 * 0.03) as u32;
    let x = width - margin;
    let line_height = (height as f32 * 0.028).max(16.0) as u32;
    let font_size = (width as f32 * 0.011).max(10.0) as u32;
    let start_y = (height as f32 * 0.15) as u32;

    let mut lines = String::new();
    let mut current_set = 0u32;

    for (i, song) in songs.iter().enumerate() {
        if song.set_number != current_set {
            current_set = song.set_number;
            let set_y = start_y + (i as u32) * line_height;
            lines.push_str(&format!(
                "<text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"700\" \
                 fill=\"rgba(255,255,255,0.5)\" text-anchor=\"end\">Set {}</text>",
                x, set_y, font_size - 2, current_set,
            ));
        }

        let y = start_y + (i as u32 + 1) * line_height;
        let (fill, weight) = if song.is_current {
            ("white", "700")
        } else {
            ("rgba(255,255,255,0.45)", "400")
        };
        let check = if song.is_current { ">" } else { "" };

        lines.push_str(&format!(
            "<text x=\"{}\" y=\"{}\" font-size=\"{}\" font-weight=\"{}\" \
             fill=\"{}\" text-anchor=\"end\" \
             filter=\"drop-shadow(0 1px 2px rgba(0,0,0,0.5))\">{} {}</text>",
            x, y, font_size, weight, fill, check, xml_escape(&song.title),
        ));
    }

    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\">\
         <g opacity=\"{}\">{}</g></svg>",
        width, height, op, lines,
    )
}

/// Generate a song art card SVG (album art placeholder + title).
/// Positioned at bottom-left, fades in at song start.
pub fn song_art_svg(
    song_title: &str,
    show_info: &str,
    width: u32,
    height: u32,
    opacity: f32,
) -> String {
    let op = format!("{:.2}", opacity.clamp(0.0, 1.0));
    let card_w = (width as f32 * 0.22) as u32;
    let card_h = (height as f32 * 0.18) as u32;
    let margin = (width as f32 * 0.04) as u32;
    let x = margin;
    let y = height - margin - card_h;
    let title_size = (card_w as f32 * 0.10).max(14.0) as u32;
    let sub_size = (card_w as f32 * 0.06).max(9.0) as u32;

    format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{}\" height=\"{}\">\
         <g opacity=\"{}\">\
         <rect x=\"{}\" y=\"{}\" width=\"{}\" height=\"{}\" rx=\"8\" \
          fill=\"rgba(0,0,0,0.65)\" stroke=\"rgba(255,255,255,0.15)\" stroke-width=\"1\"/>\
         <text x=\"{}\" y=\"{}\" font-family=\"'Helvetica Neue', Helvetica, Arial, sans-serif\" \
          font-size=\"{}\" font-weight=\"700\" fill=\"white\">{}</text>\
         <text x=\"{}\" y=\"{}\" font-family=\"'Helvetica Neue', Helvetica, Arial, sans-serif\" \
          font-size=\"{}\" font-weight=\"400\" fill=\"rgba(255,255,255,0.6)\">{}</text>\
         </g></svg>",
        width, height, op,
        x, y, card_w, card_h,
        x + 16, y + title_size + 16, title_size, xml_escape(song_title),
        x + 16, y + title_size + sub_size + 24, sub_size, xml_escape(show_info),
    )
}

fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_concert_info_svg() {
        let info = ShowInfo {
            title: "Grateful Dead".into(),
            venue: "Barton Hall, Cornell University".into(),
            date: "May 8, 1977".into(),
            era: "classic".into(),
        };
        let svg = concert_info_svg(&info, 1920, 1080, 0.9);
        assert!(svg.contains("Grateful Dead"));
        assert!(svg.contains("Barton Hall"));
        assert!(svg.contains("May 8, 1977"));
        assert!(svg.contains("xmlns"));
    }

    #[test]
    fn test_setlist_svg() {
        let songs = vec![
            SongInfo { title: "Minglewood Blues".into(), set_number: 1, track_number: 1, is_current: false },
            SongInfo { title: "Loser".into(), set_number: 1, track_number: 2, is_current: true },
            SongInfo { title: "Scarlet Begonias".into(), set_number: 2, track_number: 1, is_current: false },
        ];
        let svg = setlist_svg(&songs, 1920, 1080, 0.8);
        assert!(svg.contains("Loser"));
        assert!(svg.contains("font-weight=\"700\"")); // Current song bold
        assert!(svg.contains("Set 1"));
    }

    #[test]
    fn test_now_playing_svg() {
        let svg = now_playing_svg("Scarlet Begonias", 1920, 1080, 0.95);
        assert!(svg.contains("Scarlet Begonias"));
        assert!(svg.contains("text-anchor=\"middle\""));
    }

    #[test]
    fn test_xml_escape() {
        assert_eq!(xml_escape("Rock & Roll"), "Rock &amp; Roll");
        assert_eq!(xml_escape("A<B>C"), "A&lt;B&gt;C");
    }
}
