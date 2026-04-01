DEFAULT_BLOCKS = 12


def estimate_blocks(distance):
    return (distance + DEFAULT_BLOCKS - 1) // DEFAULT_BLOCKS
