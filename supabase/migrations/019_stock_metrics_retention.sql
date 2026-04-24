-- 019_stock_metrics_retention.sql
-- 3개월/1년 단위 계층적 데이터 보존 정책 구현

-- 1. 데이터 보존 및 요약을 수행하는 RPC 함수 생성
CREATE OR REPLACE FUNCTION public.maintain_stock_metrics_retention()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_retention_limit date := (CURRENT_DATE - INTERVAL '12 months')::date;
    v_aggregation_limit date := (CURRENT_DATE - INTERVAL '3 months')::date;
BEGIN
    -- [1단계] 3개월~12개월 사이의 데이터를 주간 평균으로 요약하여 삽입/업데이트
    -- calc_date를 해당 주의 월요일로 정규화하여 저장
    INSERT INTO public.stock_metrics (
        ticker, 
        market, 
        calc_date, 
        rs_rating, 
        ibd_proxy_score, 
        mansfield_rs_score, 
        data_quality,
        price_source
    )
    SELECT 
        ticker, 
        market, 
        date_trunc('week', calc_date)::date as weekly_date,
        AVG(rs_rating)::integer as avg_rs_rating,
        AVG(ibd_proxy_score) as avg_ibd_proxy_score,
        AVG(mansfield_rs_score) as avg_mansfield_rs_score,
        'PARTIAL' as data_quality,
        'AGGREGATED' as price_source
    FROM public.stock_metrics
    WHERE calc_date < v_aggregation_limit
      AND calc_date >= v_retention_limit
    GROUP BY ticker, market, weekly_date
    ON CONFLICT (ticker, market, calc_date) DO UPDATE 
    SET 
        rs_rating = EXCLUDED.rs_rating,
        ibd_proxy_score = EXCLUDED.ibd_proxy_score,
        mansfield_rs_score = EXCLUDED.mansfield_rs_score,
        data_quality = 'PARTIAL',
        price_source = 'AGGREGATED',
        updated_at = now();

    -- [2단계] 3개월~12개월 사이의 데이터 중 요약(월요일)이 아닌 일별 원본 데이터 삭제
    DELETE FROM public.stock_metrics
    WHERE calc_date < v_aggregation_limit
      AND calc_date >= v_retention_limit
      AND extract(dow from calc_date) != 1; -- 1: Monday

    -- [3단계] 1년이 지난 모든 데이터 삭제
    DELETE FROM public.stock_metrics
    WHERE calc_date < v_retention_limit;

    RAISE NOTICE 'Stock metrics retention policy applied successfully.';
END;
$$;

-- 2. 서비스 롤에 대한 실행 권한 부여
GRANT EXECUTE ON FUNCTION public.maintain_stock_metrics_retention() TO service_role;
GRANT EXECUTE ON FUNCTION public.maintain_stock_metrics_retention() TO authenticated; -- 대시보드에서 수동 실행 가능하도록 허용

COMMENT ON FUNCTION public.maintain_stock_metrics_retention() IS '3개월 경과 데이터 주간 압축 및 1년 경과 데이터 삭제 정책 수행';
