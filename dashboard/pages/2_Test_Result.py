import streamlit as st
from difflib import HtmlDiff
from utils.data_loader import (
    load_run_list,
    load_results_for_run,
    format_timestamp,
    load_one_result,
)
from utils.style import SIDEBAR_STYLE


st.set_page_config(page_title="Test Results", layout="wide")
st.markdown(SIDEBAR_STYLE, unsafe_allow_html=True)


def display_json_diff(test_case, container):
    """Display JSON differences in a readable format"""
    # First check for errors
    if "error" in test_case and test_case["error"]:
        container.subheader("Error Message")
        container.error(test_case["error"])
        return

    # If no errors, display JSON diff as before
    if "jsonDiff" in test_case or "fullJsonDiff" in test_case:
        container.subheader("JSON Differences")
        # Display diff stats
        stats = test_case["jsonDiffStats"]
        cols = container.columns(4)
        cols[0].metric("Additions", stats["additions"])
        cols[1].metric("Missing", stats["deletions"])
        cols[2].metric("Modifications", stats["modifications"])
        cols[3].metric("Total Changes", stats["total"])

        cols = container.columns(2)
        total_fields = test_case.get("jsonAccuracyResult", {}).get("totalFields", 0)
        cols[0].metric("Total Fields", total_fields)
        cols[1].metric("Accuracy", test_case.get("jsonAccuracy", 0))

        # Create tabs for different diff views
        tab_summary, tab_full, tab_ground_truth, tab_predicted, tab_schema = (
            container.tabs(
                ["Summary Diff", "Full Diff", "Ground Truth", "Predicted", "Schema"]
            )
        )

        with tab_summary:
            if "jsonDiff" in test_case:
                tab_summary.json(test_case["jsonDiff"])
            else:
                tab_summary.warning("Summary diff not available")

        with tab_full:
            if "fullJsonDiff" in test_case:
                tab_full.json(test_case["fullJsonDiff"])
            else:
                tab_full.warning("Full diff not available")

        with tab_ground_truth:
            tab_ground_truth.json(test_case["trueJson"])

        with tab_predicted:
            tab_predicted.json(test_case["predictedJson"])

        with tab_schema:
            tab_schema.json(test_case.get("jsonSchema", {}))


def display_file_preview(test_case, container):
    """Display the original file preview"""
    container.subheader("File Preview")
    if "fileUrl" in test_case:
        container.image(test_case["fileUrl"], width=700)
    else:
        container.warning("No file preview available")


def display_markdown_diff(test_case):
    """Display markdown differences in a side-by-side view"""
    if "trueMarkdown" in test_case and "predictedMarkdown" in test_case:
        st.subheader("Markdown Differences")

        # Create HTML diff
        differ = HtmlDiff()
        diff_html = differ.make_file(
            test_case["trueMarkdown"].splitlines(),
            test_case["predictedMarkdown"].splitlines(),
            fromdesc="True Markdown",
            todesc="Predicted Markdown",
        )

        # Process markdown content for rendering
        def process_markdown(md_content):
            # Remove escaped quotes and newlines if they exist as string literals
            if isinstance(md_content, str):
                # Replace literal \n with actual newlines
                processed = md_content.replace('\\n', '\n')
                # Remove extra quotes if the content is wrapped in them
                if processed.startswith('"') and processed.endswith('"'):
                    processed = processed[1:-1]
                return processed
            return md_content

        true_md = process_markdown(test_case["trueMarkdown"])
        predicted_md = process_markdown(test_case["predictedMarkdown"])

        # Add toggle for raw/rendered view
        view_mode = st.radio(
            "View Mode",
            ["Raw Markdown", "Rendered Markdown"],
            horizontal=True,
            key="markdown_view_mode"
        )

        # Display side-by-side view
        st.markdown("### Side by Side Comparison")
        cols = st.columns(2)
        
        with cols[0]:
            st.markdown("**True Markdown**")
            if view_mode == "Raw Markdown":
                st.text_area("", test_case["trueMarkdown"], height=400, key="true_markdown")
            else:
                st.markdown(true_md, unsafe_allow_html=True)
                
        with cols[1]:
            st.markdown("**Predicted Markdown**")
            if view_mode == "Raw Markdown":
                st.text_area(
                    "", test_case["predictedMarkdown"], height=400, key="predicted_markdown"
                )
            else:
                st.markdown(predicted_md, unsafe_allow_html=True)

        # Display HTML diff (optional, behind expander)
        with st.expander("View HTML Diff"):
            st.components.v1.html(diff_html, height=600, scrolling=True)


def main():
    st.title("Test Results")

    # Load only the list of runs initially
    runs = load_run_list()

    if not runs:
        st.warning("No results found.")
        return

    # 1. Select which test run (timestamp)
    col1, col2 = st.columns(2)
    with col1:
        selected_timestamp = st.selectbox(
            "Select Test Run",
            [run["timestamp"] for run in runs],
            format_func=format_timestamp,
        )

    # Load minimal results for the selected run (just for the dropdown)
    run_data = load_results_for_run(selected_timestamp, include_metrics_only=True)

    # Get all test cases
    all_test_cases = run_data.get("results", [])

    # Filter out None values and then filter for diffs
    all_test_cases = [test for test in all_test_cases if test is not None]

    # 2. Filter test cases for ones that have a non-empty JSON diff
    results_with_diffs = [
        test
        for test in all_test_cases
        if isinstance(test, dict)
        and isinstance(test.get("jsonDiffStats"), dict)
        and test["jsonDiffStats"].get("total", 0) > 0
    ]

    if not results_with_diffs:
        st.warning("No test cases have JSON differences for this run.")
        return

    # 3. Build the dropdown items from only those filtered test cases
    test_case_labels = {
        f"{test['id']} - OCR: {test.get('ocrModel', 'N/A')} - Extraction: {test.get('extractionModel', 'N/A')}": idx 
        for idx, test in enumerate(results_with_diffs)
    }

    with col2:
        selected_test_idx = st.selectbox(
            "Select Test Case (Only Cases with Differences)",
            options=list(test_case_labels.keys()),
            format_func=lambda x: f"{x}",
        )
        selected_test_idx = test_case_labels[selected_test_idx]  # Get the actual index

    # 4. Load only the selected test case
    selected_result_id = results_with_diffs[selected_test_idx]["id"]
    detailed_data = load_one_result(selected_timestamp, selected_result_id)
    test_case = detailed_data["result"]

    # Display run metadata if available
    if detailed_data.get("description") or detailed_data.get("run_by"):
        with st.expander("Run Details", expanded=False):
            cols = st.columns(3)
            with cols[0]:
                st.markdown(f"**Status:** {detailed_data['status'].title()}")
                if detailed_data.get("run_by"):
                    st.markdown(f"**Run By:** {detailed_data['run_by']}")
            with cols[1]:
                st.markdown(f"**Created:** {detailed_data['created_at']}")
                if detailed_data.get("completed_at"):
                    st.markdown(f"**Completed:** {detailed_data['completed_at']}")
            with cols[2]:
                if detailed_data.get("description"):
                    st.markdown(f"**Description:** {detailed_data['description']}")

    # Display model information
    st.markdown("### Model Information")
    model_cols = st.columns(3)
    with model_cols[0]:
        st.markdown(f"**OCR Model:** {test_case.get('ocrModel', 'N/A')}")
    with model_cols[1]:
        st.markdown(f"**Extraction Model:** {test_case.get('extractionModel', 'N/A')}")
    with model_cols[2]:
        direct_extraction = test_case.get('directImageExtraction', False)
        st.markdown(f"**Direct Image Extraction:** {'Yes' if direct_extraction else 'No'}")

    # Display file URL with truncation if too long
    file_url = test_case['fileUrl']
    display_url = file_url if len(file_url) < 100 else f"{file_url[:50]}...{file_url[-45:]}"
    st.markdown(f"**File URL:** [{display_url}]({file_url})")

    # Create two columns for file preview and JSON diff
    left_col, right_col = st.columns(2)

    # Display file preview on the left
    with left_col:
        display_file_preview(test_case, left_col)

    # Display JSON diff on the right
    with right_col:
        display_json_diff(test_case, right_col)

    # Display markdown diff at the bottom
    st.markdown("---")  # Add a separator
    display_markdown_diff(test_case)


if __name__ == "__main__":
    main()
